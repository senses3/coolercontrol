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
use crate::hardware_report;
use crate::hardware_support::HardwareSupportController;
use std::rc::Rc;

struct HardwareReportActor {
    receiver: mpsc::Receiver<HardwareReportMessage>,
    hardware_support: Rc<HardwareSupportController>,
}

enum HardwareReportMessage {
    /// What the startup probe found, rather than a fresh probe. Startup is
    /// when module loading actually happens, so it is the only run that can
    /// answer "why is my chip not bound".
    RetainedDetection {
        respond_to: oneshot::Sender<Option<cc_detect::DetectionResults>>,
    },
    /// An explicit re-scan replaces what the retained results say, so the
    /// health snapshot stops contradicting a scan the user just ran.
    RefreshDetection {
        results: Box<cc_detect::DetectionResults>,
        respond_to: oneshot::Sender<()>,
    },
    Generate {
        full: bool,
        respond_to: oneshot::Sender<String>,
    },
}

impl HardwareReportActor {
    pub fn new(
        receiver: mpsc::Receiver<HardwareReportMessage>,
        hardware_support: Rc<HardwareSupportController>,
    ) -> Self {
        Self {
            receiver,
            hardware_support,
        }
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
            HardwareReportMessage::RetainedDetection { respond_to } => {
                let _ = respond_to.send(self.hardware_support.detection());
            }
            HardwareReportMessage::RefreshDetection {
                results,
                respond_to,
            } => {
                self.hardware_support.refresh_detection(*results);
                let _ = respond_to.send(());
            }
            HardwareReportMessage::Generate { full, respond_to } => {
                // Retained at startup, so this never re-enumerates USB devices
                // and still includes devices the user has disabled.
                let liquidctl = self.hardware_support.liquidctl_devices();
                // Recorded by the repositories as they dropped each device, so
                // the report says why a chip is missing from the app instead of
                // leaving it looking broken.
                let hidden = self.hardware_support.hidden_hardware();
                // Cloned rather than borrowed: the generation below awaits, and
                // a `RefCell` borrow must not be held across an await point.
                let detection = self.hardware_support.detection();
                let report =
                    hardware_report::generate(full, detection.as_ref(), &liquidctl, &hidden).await;
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
        hardware_support: Rc<HardwareSupportController>,
        cancel_token: CancellationToken,
        main_scope: &'s Scope<'s, 's, Result<()>>,
    ) -> Self {
        let (sender, receiver) = mpsc::channel(1);
        let actor = HardwareReportActor::new(receiver, hardware_support);
        main_scope.spawn(run_api_actor(actor, cancel_token));
        Self { sender }
    }

    /// `None` means no probe was made (disabled by config or environment),
    /// which is not the same as a probe that found nothing.
    pub async fn retained_detection(&self) -> Result<Option<cc_detect::DetectionResults>> {
        let (tx, rx) = oneshot::channel();
        let msg = HardwareReportMessage::RetainedDetection { respond_to: tx };
        let _ = self.sender.send(msg).await;
        Ok(rx.await?)
    }

    /// Hands a fresh scan back to the retained state. Called by `POST /detect`,
    /// which is the only request that can load modules after startup.
    pub async fn refresh_detection(&self, results: cc_detect::DetectionResults) -> Result<()> {
        let (tx, rx) = oneshot::channel();
        let msg = HardwareReportMessage::RefreshDetection {
            results: Box::new(results),
            respond_to: tx,
        };
        let _ = self.sender.send(msg).await;
        Ok(rx.await?)
    }

    pub async fn generate(&self, full: bool) -> Result<String> {
        let (tx, rx) = oneshot::channel();
        let msg = HardwareReportMessage::Generate {
            full,
            respond_to: tx,
        };
        let _ = self.sender.send(msg).await;
        Ok(rx.await?)
    }
}
