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

//! Serializes duty-response probes onto the main runtime.
//!
//! The actor handles one message at a time, so two probes can never move two
//! fans at once. That is deliberate rather than incidental: this is the only
//! endpoint in the daemon that moves hardware to answer a question, and a
//! burst of requests should queue behind each other rather than turn into a
//! chorus of spinning fans.

use anyhow::Result;
use log::info;
use moro_local::Scope;
use std::rc::Rc;
use tokio::sync::{mpsc, oneshot};
use tokio_util::sync::CancellationToken;

use crate::api::actor::{run_api_actor, ApiActor};
use crate::device::{ChannelName, DeviceUID};
use crate::engine::main::Engine;
use crate::hardware_probe::{run_probe, ProbeOutcome};
use crate::hardware_support::HardwareSupportController;

struct HardwareProbeActor {
    receiver: mpsc::Receiver<HardwareProbeMessage>,
    engine: Rc<Engine>,
    hardware_support: Rc<HardwareSupportController>,
}

struct HardwareProbeMessage {
    device_uid: DeviceUID,
    channel_name: ChannelName,
    respond_to: oneshot::Sender<Result<ProbeOutcome>>,
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
        }
    }
}

impl ApiActor<HardwareProbeMessage> for HardwareProbeActor {
    fn name(&self) -> &'static str {
        "HardwareProbeActor"
    }

    fn receiver(&mut self) -> &mut mpsc::Receiver<HardwareProbeMessage> {
        &mut self.receiver
    }

    async fn handle_message(&mut self, msg: HardwareProbeMessage) {
        let HardwareProbeMessage {
            device_uid,
            channel_name,
            respond_to,
        } = msg;
        // Worth a log line even on success: this is the one action in the
        // daemon that moves a fan without the user setting a speed, so a
        // support log should show that it happened and what came of it.
        info!("Duty-response probe requested for {device_uid}:{channel_name}");
        let result = run_probe(self.engine.as_ref(), &device_uid, &channel_name).await;
        if let Ok(outcome) = &result {
            info!("Duty-response probe for {device_uid}:{channel_name}: {outcome:?}");
            if let Some(verdict) = outcome.verdict() {
                self.hardware_support
                    .record_probe_verdict(&device_uid, &channel_name, verdict);
            }
        }
        let _ = respond_to.send(result);
    }
}

/// Cloneable handle for running a duty-response probe.
///
/// Capacity 1: a probe is a human pressing a button on one channel, and the
/// actor holds each one for several seconds while the fan settles. Queueing
/// more than a single waiting request would only build a backlog of fan
/// movements nobody is still watching.
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

    pub async fn probe(
        &self,
        device_uid: DeviceUID,
        channel_name: ChannelName,
    ) -> Result<ProbeOutcome> {
        let (tx, rx) = oneshot::channel();
        let msg = HardwareProbeMessage {
            device_uid,
            channel_name,
            respond_to: tx,
        };
        let _ = self.sender.send(msg).await;
        rx.await?
    }
}
