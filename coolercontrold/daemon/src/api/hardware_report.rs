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

//! The daemon-served hardware report.
//!
//! Same text the `report` subcommand prints, plus the liquidctl section, which
//! the standalone CLI cannot produce safely. The daemon already holds the
//! device list in memory, so this costs no extra hardware access.

use axum::extract::{Query, State};
use axum::Json;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::api::{AppState, CCError};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ReportQuery {
    /// Include the whole hwmon tree instead of the compact summary.
    #[serde(default)]
    pub full: bool,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct ReportResponse {
    /// The report as plain text, ready to paste.
    pub report: String,
}

/// GET /hardware-report
pub async fn get_hardware_report(
    Query(query): Query<ReportQuery>,
    State(AppState {
        hardware_report_handle,
        ..
    }): State<AppState>,
) -> Result<Json<ReportResponse>, CCError> {
    // Generation runs on the main runtime: it reads sysfs through `cc_fs`,
    // whose futures are not `Send` and so cannot be awaited in a handler.
    // Liquidctl devices and the startup detection both come from what the
    // daemon retained, so nothing is re-enumerated or re-probed here.
    let report = hardware_report_handle
        .generate(query.full)
        .await
        .map_err(|err| CCError::InternalError {
            msg: format!("Could not generate the hardware report: {err}"),
        })?;
    Ok(Json(ReportResponse { report }))
}
