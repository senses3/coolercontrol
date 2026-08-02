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

//! The user-triggered duty-response probe.
//!
//! One channel, one press of a button. A declined probe is a 200 with a
//! reason, not an error: "we will not move this fan, and here is why" is the
//! answer to the question the user asked.

use axum::extract::{Path, State};
use axum::Json;

use crate::api::devices::DeviceChannelPath;
use crate::api::{AppState, CCError};
use crate::hardware_probe::ProbeOutcome;

/// POST /hardware-support/{`device_uid`}/channels/{`channel_name`}/probe
pub async fn probe_channel(
    Path(path): Path<DeviceChannelPath>,
    State(AppState {
        hardware_probe_handle,
        ..
    }): State<AppState>,
) -> Result<Json<ProbeOutcome>, CCError> {
    // Runs on the main runtime, which both writes the duty and serializes
    // probes against each other.
    hardware_probe_handle
        .probe(path.device_uid, path.channel_name)
        .await
        .map(Json)
        .map_err(|err| CCError::InternalError {
            msg: format!("Could not run the duty-response probe: {err}"),
        })
}
