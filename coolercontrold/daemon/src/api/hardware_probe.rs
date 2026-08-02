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

use aide::NoApi;
use axum::http::StatusCode;

use crate::api::devices::DeviceChannelPath;
use crate::api::{AppState, CCError};
use crate::hardware_probe::ProbeStatusDto;

/// POST /hardware-support/{`device_uid`}/channels/{`channel_name`}/probe
///
/// Returns as soon as the probe is under way. A probe waits at each duty for
/// the board to apply it, which outlasts the API's request timeout on hardware
/// that ramps, so the answer is collected from the status route instead.
pub async fn start_probe(
    Path(path): Path<DeviceChannelPath>,
    State(AppState {
        hardware_probe_handle,
        ..
    }): State<AppState>,
) -> Result<NoApi<StatusCode>, CCError> {
    hardware_probe_handle
        .start(path.device_uid, path.channel_name)
        .await
        .map(|()| NoApi(StatusCode::ACCEPTED))
        .map_err(|err| CCError::Conflict {
            msg: err.to_string(),
        })
}

/// GET /hardware-support/{`device_uid`}/channels/{`channel_name`}/probe
pub async fn probe_status(
    Path(path): Path<DeviceChannelPath>,
    State(AppState {
        hardware_probe_handle,
        ..
    }): State<AppState>,
) -> Result<Json<ProbeStatusDto>, CCError> {
    hardware_probe_handle
        .status(path.device_uid, path.channel_name)
        .await
        .map_err(|err| CCError::InternalError {
            msg: format!("Could not read the probe status: {err}"),
        })?
        .map(|status| Json(ProbeStatusDto::from(status)))
        .ok_or_else(|| CCError::NotFound {
            msg: "this channel has not been probed".to_string(),
        })
}
