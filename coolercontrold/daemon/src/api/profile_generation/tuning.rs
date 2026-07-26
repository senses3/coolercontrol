/*
 * CoolerControl - monitor and control your cooling and other devices
 * Copyright (c) 2021-2025  Guy Boldon and contributors
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

//! Tuning data for the auto-create-profiles wizard.
//!
//! The per-kind, per-preset "setups" (curve shapes, function parameters, EMA windows, the pump
//! duty, the case pressure bias) live in `resources/auto_profiles.toml`, compiled in via
//! `include_str!`. Contributors tweak that file and open a PR; the `embedded_tuning_*` tests parse
//! and validate the exact embedded copy, so a malformed edit fails CI rather than reaching a
//! running daemon. Only *parameters* live in the file: control flow (which temp each kind follows,
//! when smoothing applies, the minimum-duty floor, entity assembly) stays in the parent module
//! because it carries safety invariants.

use super::Preset;
use crate::device::{Duty, Temp};
use serde::Deserialize;
use std::collections::HashMap;
use std::ops::Not;
use std::sync::LazyLock;

/// The embedded tuning file. Editing it is a code change (PR); the tests below validate this exact
/// string in CI.
static TUNING_TOML: &str = include_str!("../../../resources/auto_profiles.toml");

/// The parsed, validated tuning data, built once on first access.
pub static TUNING: LazyLock<TuningConfig> = LazyLock::new(|| {
    // These `expect`s cannot fire in a shipped build: the tests below parse and validate the same
    // embedded string in CI, so any malformed edit fails tests before release.
    let config: TuningConfig =
        toml_edit::de::from_str(TUNING_TOML).expect("embedded auto_profiles.toml parses");
    config
        .validate()
        .expect("embedded auto_profiles.toml is valid");
    config
});

/// The full tuning table: shared functions plus one setup group per fan kind.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TuningConfig {
    pub functions: HashMap<String, FunctionSpec>,
    pub cpu_cooler: PresetMap,
    pub gpu_fan: PresetMap,
    pub aio_pump: PresetMap,
    pub aio_radiator: RadiatorBands,
    pub case: CaseTuning,
    pub laptop: PresetMap,
}

/// A named hysteresis function referenced by graph entries. A spec with none of
/// `deviance`/`only_downward`/`response_delay` is a plain (Identity) function; any of them present
/// makes it a Standard function. `name` is the display name of the generated function entity. The
/// `step_size_*` fields are optional: an unset one keeps the daemon default (2/100/0/0).
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FunctionSpec {
    pub name: String,
    #[serde(default)]
    pub deviance: Option<Temp>,
    #[serde(default)]
    pub only_downward: Option<bool>,
    #[serde(default)]
    pub response_delay: Option<u8>,
    #[serde(default)]
    pub step_size_min: Option<Duty>,
    #[serde(default)]
    pub step_size_max: Option<Duty>,
    #[serde(default)]
    pub step_size_min_decreasing: Option<Duty>,
    #[serde(default)]
    pub step_size_max_decreasing: Option<Duty>,
}

/// The three presets every fan kind must define. Missing one is a deserialization error, so
/// completeness is enforced by the type rather than by a runtime check.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PresetMap {
    pub silent: SetupEntry,
    pub balanced: SetupEntry,
    pub performance: SetupEntry,
}

impl PresetMap {
    pub fn get(&self, preset: Preset) -> &SetupEntry {
        match preset {
            Preset::Silent => &self.silent,
            Preset::Balanced => &self.balanced,
            Preset::Performance => &self.performance,
        }
    }
}

/// One preset's setup: either a constant duty or a temperature-driven curve.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SetupEntry {
    Fixed {
        duty: Duty,
    },
    Graph {
        curve: Vec<(Temp, Duty)>,
        #[serde(default)]
        smoothing: Option<SmoothingSpec>,
        function: String,
    },
}

/// EMA smoothing for a graph entry: the source temp is wrapped in an N-second EMA custom sensor
/// (skipped when the system has no custom-sensors device).
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SmoothingSpec {
    pub ema_window_seconds: u16,
}

/// Radiator curves keyed by the available temp signal. The CPU-fallback band reuses the
/// `cpu_cooler` curve in the parent module, so it has no table here.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RadiatorBands {
    pub delta: PresetMap,
    pub liquid: PresetMap,
}

/// Case-fan tuning: the shared Mix member curve plus the positive-pressure parameters.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CaseTuning {
    pub member: PresetMap,
    pub pressure: CasePressure,
}

/// Positive-pressure parameters. Exhaust runs `exhaust_bias_percent` below the shared thermal
/// demand; both intake and exhaust keep a `floor_percent` floor so the fan stays addressable at
/// idle. The parent module derives the overlay offset encoding from these two numbers.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CasePressure {
    pub exhaust_bias_percent: Duty,
    pub floor_percent: Duty,
}

impl TuningConfig {
    /// Validates every curve, smoothing window, function reference, and percent field. Returns the
    /// first problem found so a malformed edit surfaces a clear reason.
    pub fn validate(&self) -> Result<(), String> {
        let labeled: [(&str, &PresetMap); 7] = [
            ("cpu_cooler", &self.cpu_cooler),
            ("gpu_fan", &self.gpu_fan),
            ("aio_pump", &self.aio_pump),
            ("aio_radiator.delta", &self.aio_radiator.delta),
            ("aio_radiator.liquid", &self.aio_radiator.liquid),
            ("case.member", &self.case.member),
            ("laptop", &self.laptop),
        ];
        for (kind, preset_map) in labeled {
            self.validate_entry(kind, "silent", &preset_map.silent)?;
            self.validate_entry(kind, "balanced", &preset_map.balanced)?;
            self.validate_entry(kind, "performance", &preset_map.performance)?;
        }
        for (name, spec) in &self.functions {
            validate_function(name, spec)?;
        }
        validate_percent(
            "case.pressure.exhaust_bias_percent",
            self.case.pressure.exhaust_bias_percent,
        )?;
        validate_percent(
            "case.pressure.floor_percent",
            self.case.pressure.floor_percent,
        )?;
        Ok(())
    }

    fn validate_entry(&self, kind: &str, preset: &str, entry: &SetupEntry) -> Result<(), String> {
        match entry {
            SetupEntry::Fixed { duty } => {
                validate_percent(&format!("{kind}.{preset}.duty"), *duty)?;
            }
            SetupEntry::Graph {
                curve,
                smoothing,
                function,
            } => {
                validate_curve(kind, preset, curve)?;
                if let Some(smoothing) = smoothing {
                    if smoothing.ema_window_seconds == 0 {
                        return Err(format!(
                            "{kind}.{preset} smoothing ema_window_seconds must be greater than 0"
                        ));
                    }
                }
                if self.functions.contains_key(function).not() {
                    return Err(format!(
                        "{kind}.{preset} references unknown function \"{function}\""
                    ));
                }
            }
        }
        Ok(())
    }
}

/// A curve must be non-empty, its temps strictly increasing, its duties non-decreasing and no more
/// than 100%.
fn validate_curve(kind: &str, preset: &str, curve: &[(Temp, Duty)]) -> Result<(), String> {
    if curve.is_empty() {
        return Err(format!(
            "{kind}.{preset} curve must have at least one point"
        ));
    }
    for &(_, duty) in curve {
        if duty > 100 {
            return Err(format!("{kind}.{preset} curve duty {duty} exceeds 100"));
        }
    }
    if curve.windows(2).all(|w| w[0].0 < w[1].0).not() {
        return Err(format!(
            "{kind}.{preset} curve temps must strictly increase"
        ));
    }
    if curve.windows(2).all(|w| w[0].1 <= w[1].1).not() {
        return Err(format!("{kind}.{preset} curve duties must not decrease"));
    }
    Ok(())
}

/// A percent field must be within 0..=100.
fn validate_percent(label: &str, value: Duty) -> Result<(), String> {
    if value > 100 {
        return Err(format!("{label} must be within 0..=100, got {value}"));
    }
    Ok(())
}

/// A function's optional step-size fields must each be within 0..=100.
fn validate_function(name: &str, spec: &FunctionSpec) -> Result<(), String> {
    for (field, value) in [
        ("step_size_min", spec.step_size_min),
        ("step_size_max", spec.step_size_max),
        ("step_size_min_decreasing", spec.step_size_min_decreasing),
        ("step_size_max_decreasing", spec.step_size_max_decreasing),
    ] {
        if let Some(value) = value {
            validate_percent(&format!("functions.{name}.{field}"), value)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Goal: the compiled-in tuning file parses and passes validation, so a malformed edit fails
    /// CI rather than a running daemon. Method: force the `LazyLock` (which parses and validates)
    /// and spot check representative entries to guard against silent structural drift.
    #[test]
    fn embedded_tuning_parses_and_validates() {
        let tuning = &*TUNING;
        assert!(matches!(
            tuning.cpu_cooler.get(Preset::Balanced),
            SetupEntry::Graph { .. }
        ));
        assert!(matches!(
            tuning.aio_pump.get(Preset::Balanced),
            SetupEntry::Fixed { .. }
        ));
        assert!(matches!(
            tuning.laptop.get(Preset::Silent),
            SetupEntry::Graph {
                smoothing: Some(_),
                ..
            }
        ));
    }

    /// Goal: no Performance preset smooths its temp, so every Performance profile reacts at once.
    /// Method: walk every kind's Performance entry in the embedded file and assert none of them
    /// sets smoothing.
    #[test]
    fn performance_presets_never_smooth() {
        let kinds = [
            ("cpu_cooler", &TUNING.cpu_cooler),
            ("gpu_fan", &TUNING.gpu_fan),
            ("aio_pump", &TUNING.aio_pump),
            ("aio_radiator.delta", &TUNING.aio_radiator.delta),
            ("aio_radiator.liquid", &TUNING.aio_radiator.liquid),
            ("case.member", &TUNING.case.member),
            ("laptop", &TUNING.laptop),
        ];
        for (kind, presets) in kinds {
            if let SetupEntry::Graph { smoothing, .. } = presets.get(Preset::Performance) {
                assert!(
                    smoothing.is_none(),
                    "{kind} Performance must follow the raw temp"
                );
            }
        }
    }

    /// Goal: a graph entry referencing a function with no table is rejected. Method: rewrite one
    /// real function reference to a nonexistent name and assert validation fails.
    #[test]
    fn rejects_unknown_function_reference() {
        let bad = TUNING_TOML.replacen("function = \"balanced\"", "function = \"nope\"", 1);
        let config: TuningConfig =
            toml_edit::de::from_str(&bad).expect("still parses structurally");
        assert!(config.validate().is_err());
    }

    /// Goal: a curve whose temps do not strictly increase is rejected. Method: replace a real CPU
    /// cooler curve with a backwards one and assert validation fails.
    #[test]
    fn rejects_non_monotonic_curve() {
        let bad = TUNING_TOML.replacen(
            "curve = [[45.0, 25], [60.0, 40], [75.0, 70], [85.0, 100]]",
            "curve = [[45.0, 25], [40.0, 40]]",
            1,
        );
        let config: TuningConfig =
            toml_edit::de::from_str(&bad).expect("still parses structurally");
        assert!(config.validate().is_err());
    }

    /// Goal: a curve duty above 100% is rejected. Method: bump one curve point past 100 and assert
    /// validation fails.
    #[test]
    fn rejects_duty_over_one_hundred() {
        let bad = TUNING_TOML.replacen("[85.0, 100]", "[85.0, 150]", 1);
        let config: TuningConfig =
            toml_edit::de::from_str(&bad).expect("still parses structurally");
        assert!(config.validate().is_err());
    }

    /// Goal: an entire missing preset is caught at parse time (completeness by type). Method: drop
    /// the `cpu_cooler.performance` table and assert deserialization fails.
    #[test]
    fn missing_preset_fails_to_parse() {
        let bad = TUNING_TOML.replace("[cpu_cooler.performance]", "[cpu_cooler.unused]");
        assert!(toml_edit::de::from_str::<TuningConfig>(&bad).is_err());
    }
}
