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
use nix::unistd::Uid;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::api::{AppState, CCError};
use crate::device::DriverType;
use crate::hardware_report::LiquidctlSummary;

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
        device_handle,
        hardware_report_handle,
        ..
    }): State<AppState>,
) -> Result<Json<ReportResponse>, CCError> {
    let devices = device_handle
        .devices_get()
        .await
        .map_err(|err| CCError::InternalError {
            msg: format!("Could not read the device list: {err}"),
        })?;
    let liquidctl = collect_liquidctl(&devices);
    // Generation runs on the main runtime: it reads sysfs through `cc_fs`,
    // whose futures are not `Send` and so cannot be awaited in a handler.
    let report = hardware_report_handle
        .generate(query.full, Uid::effective().is_root(), liquidctl)
        .await
        .map_err(|err| CCError::InternalError {
            msg: format!("Could not generate the hardware report: {err}"),
        })?;
    Ok(Json(ReportResponse { report }))
}

/// Reduces the live device list to the liquidctl entries.
///
/// Only the fields a maintainer needs are carried across. The device uid and
/// `device_id` are dropped on purpose: `device_id` can be a serial number, and
/// this text is meant to be pasted into a public support channel.
fn collect_liquidctl(devices: &[crate::api::devices::DeviceDto]) -> Vec<LiquidctlSummary> {
    devices
        .iter()
        .filter(|device| device.info.driver_info.drv_type == DriverType::Liquidctl)
        .map(|device| LiquidctlSummary {
            name: device.name.clone(),
            driver_class: device
                .lc_info
                .as_ref()
                .map(|lc| lc.driver_type.to_string())
                .or_else(|| device.info.driver_info.name.clone()),
            liquidctl_version: device.info.driver_info.version.clone(),
            firmware_version: device
                .lc_info
                .as_ref()
                .and_then(|lc| lc.firmware_version.clone()),
            hwmon_backed: device
                .info
                .driver_info
                .locations
                .iter()
                .any(|location| location.contains("hwmon")),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::devices::DeviceDto;
    use crate::device::{DeviceInfo, DeviceType, DriverInfo, LcInfo};
    use std::ops::Not;

    fn device(drv_type: DriverType, locations: Vec<String>) -> DeviceDto {
        DeviceDto {
            name: "NZXT Kraken".to_string(),
            d_type: DeviceType::Liquidctl,
            type_index: 1,
            uid: "uid-1".to_string(),
            lc_info: Some(LcInfo {
                driver_type: crate::repositories::liquidctl::base_driver::BaseDriver::Kraken2,
                firmware_version: Some("1.2.3".to_string()),
                unknown_asetek: false,
            }),
            info: DeviceInfo {
                driver_info: DriverInfo {
                    drv_type,
                    name: Some("kraken2".to_string()),
                    version: Some("1.15.0".to_string()),
                    locations,
                },
                ..Default::default()
            },
        }
    }

    /// Goal: only liquidctl devices reach the section, so a kernel-driven fan
    /// controller is not double-reported under both Fan channels and Liquidctl.
    #[test]
    fn only_liquidctl_devices_are_collected() {
        let devices = vec![
            device(DriverType::Liquidctl, Vec::new()),
            device(DriverType::Kernel, Vec::new()),
        ];
        assert_eq!(collect_liquidctl(&devices).len(), 1);
    }

    /// Goal: a device exposed through hwmon is marked as such, so a reader can
    /// tell that its channels also appear in the Fan channels section rather
    /// than thinking it is listed twice by mistake.
    #[test]
    fn hwmon_backed_devices_are_flagged() {
        let backed = collect_liquidctl(&[device(
            DriverType::Liquidctl,
            vec!["/sys/class/hwmon/hwmon8".to_string()],
        )]);
        assert!(backed[0].hwmon_backed);
        let usb_only = collect_liquidctl(&[device(
            DriverType::Liquidctl,
            vec!["/dev/hidraw3".to_string()],
        )]);
        assert!(usb_only[0].hwmon_backed.not());
    }

    /// Goal: the summary carries no identifying field. The uid is dropped and
    /// there is no serial anywhere, because this text gets pasted in public.
    #[test]
    fn summary_carries_no_identifiers() {
        let summaries = collect_liquidctl(&[device(DriverType::Liquidctl, Vec::new())]);
        let rendered = format!(
            "{} {:?} {:?} {:?}",
            summaries[0].name,
            summaries[0].driver_class,
            summaries[0].liquidctl_version,
            summaries[0].firmware_version
        );
        assert!(rendered.contains("uid-1").not(), "uid leaked: {rendered}");
    }
}
