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

//! Serializes hardware report generation onto the main runtime.
//!
//! The report reads sysfs through `cc_fs`, whose futures are not `Send`, so it
//! cannot run inside an Axum handler directly. Routing it through an actor is
//! the same arrangement every other repository-touching endpoint uses.

use anyhow::Result;
use moro_local::Scope;
use tokio::sync::{mpsc, oneshot};
use tokio_util::sync::CancellationToken;

use crate::api::actor::{run_api_actor, ApiActor};
use crate::hardware_report::{self, LiquidctlSummary};

struct HardwareReportActor {
    receiver: mpsc::Receiver<HardwareReportMessage>,
}

enum HardwareReportMessage {
    Generate {
        full: bool,
        is_root: bool,
        liquidctl: Vec<LiquidctlSummary>,
        respond_to: oneshot::Sender<String>,
    },
}

impl HardwareReportActor {
    pub fn new(receiver: mpsc::Receiver<HardwareReportMessage>) -> Self {
        Self { receiver }
    }
}

impl ApiActor<HardwareReportMessage> for HardwareReportActor {
    fn name(&self) -> &'static str {
        "HardwareReportActor"
    }

    fn receiver(&mut self) -> &mut mpsc::Receiver<HardwareReportMessage> {
        &mut self.receiver
    }

    async fn handle_message(&mut self, msg: HardwareReportMessage) {
        match msg {
            HardwareReportMessage::Generate {
                full,
                is_root,
                liquidctl,
                respond_to,
            } => {
                let report = hardware_report::generate(full, is_root, Some(&liquidctl)).await;
                let _ = respond_to.send(report);
            }
        }
    }
}

/// Cloneable handle for generating the hardware report.
///
/// Capacity 1: the report is a human-triggered support action, not something
/// polled, so queueing more than one has no value and bounds the sysfs work a
/// burst of requests can start.
#[derive(Clone)]
pub struct HardwareReportHandle {
    sender: mpsc::Sender<HardwareReportMessage>,
}

impl HardwareReportHandle {
    pub fn new<'s>(
        cancel_token: CancellationToken,
        main_scope: &'s Scope<'s, 's, Result<()>>,
    ) -> Self {
        let (sender, receiver) = mpsc::channel(1);
        let actor = HardwareReportActor::new(receiver);
        main_scope.spawn(run_api_actor(actor, cancel_token));
        Self { sender }
    }

    pub async fn generate(
        &self,
        full: bool,
        is_root: bool,
        liquidctl: Vec<LiquidctlSummary>,
    ) -> Result<String> {
        let (tx, rx) = oneshot::channel();
        let msg = HardwareReportMessage::Generate {
            full,
            is_root,
            liquidctl,
            respond_to: tx,
        };
        let _ = self.sender.send(msg).await;
        Ok(rx.await?)
    }
}
