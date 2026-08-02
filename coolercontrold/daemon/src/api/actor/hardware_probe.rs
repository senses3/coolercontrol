/*
 * CoolerControl - monitor and control your cooling and other devices
 * Copyright (c) 2021-2025  Guy Boldon, Eren Simsek and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

//! Runs duty-response probes off the request that asked for one.
//!
//! A probe walks a ladder of duties and waits at each rung for the board to
//! apply it, which on hardware that ramps takes the better part of a minute.
//! The API carries a 30 s timeout, so holding the request open until the answer
//! arrived meant the client always got a 408 while the probe ran on to
//! completion unseen. Starting it and polling for the result is the same
//! arrangement calibration uses, and for the same reason.

use anyhow::{anyhow, Result};
use log::info;
use moro_local::Scope;
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use tokio::sync::{mpsc, oneshot};
use tokio_util::sync::CancellationToken;

use crate::api::actor::{run_api_actor, ApiActor};
use crate::calibration::ChannelKey;
use crate::device::{ChannelName, DeviceUID};
use crate::engine::main::Engine;
use crate::hardware_probe::{run_probe, ProbeOutcome, ProbeStatus};
use crate::hardware_support::HardwareSupportController;
use crate::rt;

/// Probe state per channel. Entries are kept after finishing so the client can
/// still collect a result it was not waiting for.
type ProbeStates = Rc<RefCell<HashMap<ChannelKey, ProbeStatus>>>;

struct HardwareProbeActor {
    receiver: mpsc::Receiver<HardwareProbeMessage>,
    engine: Rc<Engine>,
    hardware_support: Rc<HardwareSupportController>,
    states: ProbeStates,
}

enum HardwareProbeMessage {
    Start {
        key: ChannelKey,
        respond_to: oneshot::Sender<Result<()>>,
    },
    Status {
        key: ChannelKey,
        respond_to: oneshot::Sender<Option<ProbeStatus>>,
    },
}

impl HardwareProbeActor {
    fn new(
        receiver: mpsc::Receiver<HardwareProbeMessage>,
        engine: Rc<Engine>,
        hardware_support: Rc<HardwareSupportController>,
    ) -> Self {
        Self {
            receiver,
            engine,
            hardware_support,
            states: Rc::new(RefCell::new(HashMap::new())),
        }
    }

    /// Refuses a second probe on the same channel, then runs this one off the
    /// mailbox so status queries are answered while it is in flight.
    fn spawn_probe(&self, key: ChannelKey) -> Result<()> {
        if matches!(self.states.borrow().get(&key), Some(ProbeStatus::Running)) {
            return Err(anyhow!(
                "a probe is already running for {}:{}",
                key.0,
                key.1
            ));
        }
        self.states
            .borrow_mut()
            .insert(key.clone(), ProbeStatus::Running);
        let engine = Rc::clone(&self.engine);
        let hardware_support = Rc::clone(&self.hardware_support);
        let states = Rc::clone(&self.states);
        rt::spawn(async move {
            let (device_uid, channel_name) = key.clone();
            let result = run_probe(engine.as_ref(), &device_uid, &channel_name).await;
            let status = match result {
                Ok(outcome) => {
                    info!("Duty-response probe for {device_uid}:{channel_name}: {outcome:?}");
                    record_verdict(&hardware_support, &device_uid, &channel_name, &outcome);
                    ProbeStatus::Finished(outcome)
                }
                Err(err) => {
                    info!("Duty-response probe for {device_uid}:{channel_name} failed: {err}");
                    ProbeStatus::Failed(err.to_string())
                }
            };
            states.borrow_mut().insert(key, status);
        });
        Ok(())
    }
}

/// Publishes what the probe established, when it established anything.
fn record_verdict(
    hardware_support: &HardwareSupportController,
    device_uid: &str,
    channel_name: &str,
    outcome: &ProbeOutcome,
) {
    let Some(verdict) = outcome.verdict() else {
        return;
    };
    hardware_support.record_probe_verdict(device_uid, channel_name, verdict);
}

impl ApiActor<HardwareProbeMessage> for HardwareProbeActor {
    fn name(&self) -> &'static str {
        "HardwareProbeActor"
    }

    fn receiver(&mut self) -> &mut mpsc::Receiver<HardwareProbeMessage> {
        &mut self.receiver
    }

    async fn handle_message(&mut self, msg: HardwareProbeMessage) {
        match msg {
            HardwareProbeMessage::Start { key, respond_to } => {
                // Worth a log line even on success: this is the one action in
                // the daemon that moves a fan without the user setting a speed.
                info!("Duty-response probe requested for {}:{}", key.0, key.1);
                let _ = respond_to.send(self.spawn_probe(key));
            }
            HardwareProbeMessage::Status { key, respond_to } => {
                let _ = respond_to.send(self.states.borrow().get(&key).cloned());
            }
        }
    }
}

/// Cloneable handle for the duty-response probe.
///
/// Capacity 1: both messages are trivial now that the probe itself runs off
/// the mailbox, so nothing queues behind a running fan.
#[derive(Clone)]
pub struct HardwareProbeHandle {
    sender: mpsc::Sender<HardwareProbeMessage>,
}

impl HardwareProbeHandle {
    pub fn new<'s>(
        engine: Rc<Engine>,
        hardware_support: Rc<HardwareSupportController>,
        cancel_token: CancellationToken,
        main_scope: &'s Scope<'s, 's, Result<()>>,
    ) -> Self {
        let (sender, receiver) = mpsc::channel(1);
        let actor = HardwareProbeActor::new(receiver, engine, hardware_support);
        main_scope.spawn(run_api_actor(actor, cancel_token));
        Self { sender }
    }

    /// Starts a probe. Returns an error when one is already in flight for the
    /// channel.
    pub async fn start(&self, device_uid: DeviceUID, channel_name: ChannelName) -> Result<()> {
        let (tx, rx) = oneshot::channel();
        let msg = HardwareProbeMessage::Start {
            key: (device_uid, channel_name),
            respond_to: tx,
        };
        let _ = self.sender.send(msg).await;
        rx.await?
    }

    /// The probe's state, or `None` when this channel has never been probed.
    pub async fn status(
        &self,
        device_uid: DeviceUID,
        channel_name: ChannelName,
    ) -> Result<Option<ProbeStatus>> {
        let (tx, rx) = oneshot::channel();
        let msg = HardwareProbeMessage::Status {
            key: (device_uid, channel_name),
            respond_to: tx,
        };
        let _ = self.sender.send(msg).await;
        Ok(rx.await?)
    }
}
