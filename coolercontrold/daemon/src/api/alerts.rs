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

use crate::alerts::{
    Alert, AlertLog, AlertName, AlertState, MAX_ALERT_SOURCES, MIN_REPEAT_INTERVAL_SECONDS,
};
use crate::api::{handle_error, validate_name_string, AppState, CCError};
use crate::device::UID;
use crate::setting::ChannelSource;
use axum::extract::{Path, State};
use axum::Json;
use chrono::{DateTime, Local};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::ops::Not;

/// Retrieves the persisted Alert list
pub async fn get_all(
    State(AppState { alert_handle, .. }): State<AppState>,
) -> Result<Json<AlertsDto>, CCError> {
    alert_handle
        .get_all()
        .await
        .map(|all| {
            Json(AlertsDto {
                alerts: all.0.into_iter().map(AlertDto::from).collect(),
                logs: all.1,
            })
        })
        .map_err(handle_error)
}

pub async fn create(
    State(AppState { alert_handle, .. }): State<AppState>,
    Json(alert_dto): Json<AlertDto>,
) -> Result<(), CCError> {
    validate_alert(&alert_dto)?;
    alert_handle
        .create(Alert::from(alert_dto))
        .await
        .map_err(handle_error)
}

pub async fn update(
    State(AppState { alert_handle, .. }): State<AppState>,
    Json(alert_dto): Json<AlertDto>,
) -> Result<(), CCError> {
    validate_alert(&alert_dto)?;
    alert_handle
        .update(Alert::from(alert_dto))
        .await
        .map_err(handle_error)
}

pub async fn delete(
    Path(path): Path<AlertPath>,
    State(AppState { alert_handle, .. }): State<AppState>,
) -> Result<(), CCError> {
    alert_handle
        .delete(path.alert_uid)
        .await
        .map_err(handle_error)
}

fn validate_alert(alert: &AlertDto) -> Result<(), CCError> {
    validate_name_string(&alert.name)?;
    if alert.uid.is_empty() {
        return Err(CCError::UserError {
            msg: "uid cannot be empty".to_string(),
        });
    }
    validate_sources(alert)?;
    validate_thresholds(alert)
}

/// The effective source list: `channel_sources` when present, otherwise the
/// legacy single `channel_source`.
fn effective_sources(alert: &AlertDto) -> Vec<ChannelSource> {
    if alert.channel_sources.is_empty().not() {
        return alert.channel_sources.clone();
    }
    alert
        .channel_source
        .clone()
        .map_or_else(Vec::new, |source| vec![source])
}

fn validate_sources(alert: &AlertDto) -> Result<(), CCError> {
    let sources = effective_sources(alert);
    if sources.is_empty() {
        return Err(CCError::UserError {
            msg: "at least one channel source is required".to_string(),
        });
    }
    if sources.len() > MAX_ALERT_SOURCES {
        return Err(CCError::UserError {
            msg: format!("at most {MAX_ALERT_SOURCES} channel sources are allowed"),
        });
    }
    let first_metric = &sources[0].channel_metric;
    for source in &sources {
        if source.device_uid.is_empty() {
            return Err(CCError::UserError {
                msg: "channel_source.device_uid cannot be empty".to_string(),
            });
        }
        if source.channel_name.is_empty() {
            return Err(CCError::UserError {
                msg: "channel_source.channel_name cannot be empty".to_string(),
            });
        }
        if source.channel_metric != *first_metric {
            return Err(CCError::UserError {
                msg: "all channel sources must share the same metric".to_string(),
            });
        }
    }
    Ok(())
}

#[allow(clippy::float_cmp)]
fn validate_thresholds(alert: &AlertDto) -> Result<(), CCError> {
    if alert.max < alert.min {
        return Err(CCError::UserError {
            msg: "max must be greater than min".to_string(),
        });
    }
    if alert.max == alert.min {
        return Err(CCError::UserError {
            msg: "max and min cannot be equal".to_string(),
        });
    }
    if alert.max < 0.0 {
        return Err(CCError::UserError {
            msg: "max cannot be negative".to_string(),
        });
    }
    if alert.min < 0.0 {
        return Err(CCError::UserError {
            msg: "min cannot be negative".to_string(),
        });
    }
    if alert.warmup_duration.is_sign_negative() {
        return Err(CCError::UserError {
            msg: "warmup_duration cannot be negative".to_string(),
        });
    }
    if alert.cooldown_duration.is_sign_negative() {
        return Err(CCError::UserError {
            msg: "cooldown_duration cannot be negative".to_string(),
        });
    }
    if alert.repeat_interval.is_sign_negative() {
        return Err(CCError::UserError {
            msg: "repeat_interval cannot be negative".to_string(),
        });
    }
    if alert.repeat_interval > 0.0 && alert.repeat_interval < MIN_REPEAT_INTERVAL_SECONDS {
        return Err(CCError::UserError {
            msg: format!(
                "repeat_interval must be at least {MIN_REPEAT_INTERVAL_SECONDS} seconds, or 0 to disable"
            ),
        });
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AlertPath {
    alert_uid: UID,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AlertsDto {
    alerts: Vec<AlertDto>,
    logs: Vec<AlertLog>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[allow(clippy::struct_excessive_bools)]
pub struct AlertDto {
    pub uid: UID,
    pub name: AlertName,

    /// Legacy single source; still accepted on input when `channel_sources`
    /// is empty and always populated on output for older API clients.
    #[serde(default)]
    pub channel_source: Option<ChannelSource>,

    /// All watched sources; entries must share one `ChannelMetric`.
    #[serde(default)]
    pub channel_sources: Vec<ChannelSource>,

    pub min: f64,
    pub max: f64,

    // We send the current state, but we don't receive it when creating or updating:
    #[serde(default)]
    pub state: Option<AlertState>,

    /// Per-source states, parallel to `channel_sources`. Output-only.
    #[serde(default)]
    pub source_states: Vec<SourceStateDto>,

    /// Time in seconds throughout which the alert condition must hold before the alert is activated
    pub warmup_duration: f64,

    /// Time in seconds the value must stay back in range before an Active alert clears.
    #[serde(default)]
    pub cooldown_duration: f64,

    /// Seconds between repeated notifications while Active; 0 disables, minimum 60 otherwise.
    #[serde(default)]
    pub repeat_interval: f64,

    /// A disabled alert is not evaluated at all.
    #[serde(default = "default_true")]
    pub enabled: bool,

    /// While set to a future time, notifications and shutdown are suppressed.
    #[serde(default)]
    pub silenced_until: Option<DateTime<Local>>,

    /// Toggle a desktop notification when this alert enters an `Active` state. (true by default)
    #[serde(default = "default_true")]
    pub desktop_notify: bool,

    /// Toggle a desktop notification when this alert enters an `Inactive` state.
    #[serde(default = "default_true")]
    pub desktop_notify_recovery: bool,

    /// Toggle whether the desktop notification attempts to play an audio sound
    /// when this alert enters an `Active` state.
    /// Note: only applies when `desktop_notify` is enabled.
    #[serde(default)]
    pub desktop_notify_audio: bool,

    /// Toggle whether to issue a system shutdown when this Alert enters an `Active` state.
    #[serde(default)]
    pub shutdown_on_activation: bool,
}

/// The wire-visible state of one watched source.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SourceStateDto {
    pub channel_source: ChannelSource,
    pub state: AlertState,
}

impl From<Alert> for AlertDto {
    fn from(alert: Alert) -> Self {
        let source_states = alert
            .channel_sources
            .iter()
            .zip(alert.source_states.iter())
            .map(|(channel_source, state)| SourceStateDto {
                channel_source: channel_source.clone(),
                state: *state,
            })
            .collect();
        AlertDto {
            uid: alert.uid,
            name: alert.name,
            channel_source: Some(alert.channel_source),
            channel_sources: alert.channel_sources,
            min: alert.min,
            max: alert.max,
            state: Some(alert.state),
            source_states,
            warmup_duration: alert.warmup_duration,
            cooldown_duration: alert.cooldown_duration,
            repeat_interval: alert.repeat_interval,
            enabled: alert.enabled,
            silenced_until: alert.silenced_until,
            desktop_notify: alert.desktop_notify,
            desktop_notify_recovery: alert.desktop_notify_recovery,
            desktop_notify_audio: alert.desktop_notify_audio,
            shutdown_on_activation: alert.shutdown_on_activation,
        }
    }
}

impl From<AlertDto> for Alert {
    fn from(alert_dto: AlertDto) -> Self {
        let channel_sources = effective_sources(&alert_dto);
        // Guaranteed by validate_alert at the API boundary.
        assert!(channel_sources.is_empty().not());
        let source_count = channel_sources.len();
        Alert {
            uid: alert_dto.uid,
            name: alert_dto.name,
            channel_source: channel_sources[0].clone(),
            channel_sources,
            min: alert_dto.min,
            max: alert_dto.max,
            state: AlertState::Inactive,
            warmup_duration: alert_dto.warmup_duration,
            cooldown_duration: alert_dto.cooldown_duration,
            repeat_interval: alert_dto.repeat_interval,
            enabled: alert_dto.enabled,
            silenced_until: alert_dto.silenced_until,
            desktop_notify: alert_dto.desktop_notify,
            desktop_notify_recovery: alert_dto.desktop_notify_recovery,
            desktop_notify_audio: alert_dto.desktop_notify_audio,
            shutdown_on_activation: alert_dto.shutdown_on_activation,
            source_states: vec![AlertState::Inactive; source_count],
            last_notified: None,
            notified: false,
            shutdown_scheduled: false,
        }
    }
}

fn default_true() -> bool {
    true
}
