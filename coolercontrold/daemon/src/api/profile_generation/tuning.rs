// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

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

/// The shape a generated curve must have to read as a curve in the UI rather than a cliff. The
/// graph is drawn on an axis spanning the curve's own points, so too few points or too narrow a
/// span produces a near-vertical line across an empty chart. A band whose signal has a narrower
/// usable range (the radiator Delta tops out near 15C) pads the span with repeated duties instead
/// of stretching the ramp past what the sensor reaches.
pub const MIN_CURVE_POINTS: usize = 3;
pub const MIN_CURVE_TEMP_SPREAD: Temp = 20.0;

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
    pub scale: ScaleTuning,
    pub functions: HashMap<String, FunctionSpec>,
    pub cpu_cooler: PresetMap,
    pub gpu_fan: PresetMap,
    pub aio_pump: PresetMap,
    pub aio_radiator: RadiatorBands,
    pub case: CaseTuning,
    pub laptop: PresetMap,
}

/// The nominal fan model that converts an authored PWM curve to the true-duty scale a calibrated
/// channel reads. `nominal_dead_zone_percent` is the PWM a typical fan starts turning at: below it
/// a raw channel writes duty the fan cannot use, while a calibrated channel has that span removed
/// already. See the file header for why this is one figure rather than each fan's own calibration.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScaleTuning {
    pub nominal_dead_zone_percent: Duty,
}

impl ScaleTuning {
    /// The true duty a calibrated channel needs to spin as fast as `pwm` would on a raw one.
    ///
    /// Both ends are exact rather than modelled, because they are the same physical state on
    /// either scale: 0 is a stopped fan and 100 is the fan flat out. Only what lies between them
    /// is an approximation of the fan's response. Anything the author wanted spinning stays at 1%
    /// or above, so a low duty can never round down into a stopped fan.
    pub fn pwm_to_true_duty(&self, pwm: Duty) -> Duty {
        if pwm == 0 {
            return 0;
        }
        if pwm >= 100 {
            return 100;
        }
        let dead = self.nominal_dead_zone_percent;
        debug_assert!(dead < 100, "validated at load");
        let span = u32::from(100 - dead);
        let above = u32::from(pwm.saturating_sub(dead));
        let true_duty = (above * 100 + span / 2) / span;
        Duty::try_from(true_duty.min(100)).unwrap_or(100).max(1)
    }
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
/// `cpu_cooler` curve in the parent module, and the GPU member of a radiator Mix reuses
/// `case.member`, so neither has a table here.
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
        if self.scale.nominal_dead_zone_percent >= 100 {
            return Err(format!(
                "scale.nominal_dead_zone_percent must be within 0..=99, got {}",
                self.scale.nominal_dead_zone_percent
            ));
        }
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

/// A curve must carry at least `MIN_CURVE_POINTS` points spanning `MIN_CURVE_TEMP_SPREAD`, with
/// temps strictly increasing, duties non-decreasing and no more than 100%.
fn validate_curve(kind: &str, preset: &str, curve: &[(Temp, Duty)]) -> Result<(), String> {
    if curve.len() < MIN_CURVE_POINTS {
        return Err(format!(
            "{kind}.{preset} curve must have at least {MIN_CURVE_POINTS} points, got {}",
            curve.len()
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
    // Indexing is safe: the length check above guarantees at least MIN_CURVE_POINTS points.
    let spread = curve[curve.len() - 1].0 - curve[0].0;
    if spread < MIN_CURVE_TEMP_SPREAD {
        return Err(format!(
            "{kind}.{preset} curve must span at least {MIN_CURVE_TEMP_SPREAD}C, got {spread}C"
        ));
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

    /// Goal: the Silent pump stays a staircase rather than drifting back into a ramp: a pump gains
    /// little from continuous speed changes. Method: assert its curve holds each speed across a
    /// flat pair of points, and that its function carries the hysteresis that keeps it from
    /// flapping across a riser.
    #[test]
    fn silent_pump_curve_is_a_staircase() {
        let SetupEntry::Graph {
            curve, function, ..
        } = TUNING.aio_pump.get(Preset::Silent)
        else {
            panic!("the Silent pump is a graph");
        };
        let shelves = curve.windows(2).filter(|w| w[0].1 == w[1].1).count();
        assert!(shelves >= 2, "every pump speed is held across a shelf");
        let spec = TUNING
            .functions
            .get(function)
            .expect("the reference is validated at load");
        assert!(
            spec.deviance.is_some(),
            "a stepped curve needs hysteresis to hold its shelves"
        );
    }

    /// Goal: the GPU curve reused as a radiator Mix member can never lift the fan on its own, so
    /// an idle card leaves the loop curve in charge. Method: for every preset, assert the GPU
    /// curve's opening duty is no higher than the opening duty of each radiator band it is mixed
    /// with. Lowering a radiator curve's opening below the GPU curve's breaks this.
    #[test]
    fn the_gpu_member_never_outbids_an_idle_radiator() {
        for preset in [Preset::Silent, Preset::Balanced, Preset::Performance] {
            let gpu_floor = opening_duty(TUNING.gpu_fan.get(preset));
            for (band, presets) in [
                ("delta", &TUNING.aio_radiator.delta),
                ("liquid", &TUNING.aio_radiator.liquid),
                ("cpu", &TUNING.cpu_cooler),
            ] {
                assert!(
                    gpu_floor <= opening_duty(presets.get(preset)),
                    "the GPU member outbids the idle {band} radiator curve on {preset}"
                );
            }
        }
    }

    /// The duty a graph entry holds below its first knee.
    fn opening_duty(entry: &SetupEntry) -> Duty {
        match entry {
            SetupEntry::Graph { curve, .. } => curve[0].1,
            SetupEntry::Fixed { duty } => *duty,
        }
    }

    /// Goal: the nominal conversion behaves at the ends and in the middle, since every calibrated
    /// curve goes through it. Method: convert the boundary duties and one mid-curve value.
    #[test]
    fn pwm_to_true_duty_maps_the_scale_ends_and_middle() {
        let scale = &TUNING.scale;
        assert_eq!(scale.pwm_to_true_duty(0), 0, "an off fan stays off");
        assert_eq!(scale.pwm_to_true_duty(100), 100, "full speed is full speed");
        assert!(
            scale.pwm_to_true_duty(99) < 100,
            "the exact-100 case does not swallow the duties below it"
        );
        assert_eq!(
            scale.pwm_to_true_duty(scale.nominal_dead_zone_percent),
            1,
            "the dead zone's top is the slowest a fan still turns"
        );
        assert_eq!(
            scale.pwm_to_true_duty(scale.nominal_dead_zone_percent / 2),
            1,
            "inside the dead zone never reads as off"
        );
        // Integer division puts the halfway PWM up to half a percent low, so allow one point.
        let midpoint = (100 + u16::from(scale.nominal_dead_zone_percent)) / 2;
        let converted = scale.pwm_to_true_duty(Duty::try_from(midpoint).expect("under 100"));
        assert!(
            converted.abs_diff(50) <= 1,
            "halfway up the usable span is half the true scale, got {converted}"
        );
    }

    /// Goal: a dead zone of 100 would divide by zero when converting, so it is rejected at load.
    /// Method: set it to 100 and assert validation fails.
    #[test]
    fn rejects_a_full_dead_zone() {
        let bad = TUNING_TOML.replacen(
            &format!(
                "nominal_dead_zone_percent = {}",
                TUNING.scale.nominal_dead_zone_percent
            ),
            "nominal_dead_zone_percent = 100",
            1,
        );
        let config: TuningConfig =
            toml_edit::de::from_str(&bad).expect("still parses structurally");
        assert!(config.validate().is_err());
    }

    /// Rewrites the file's first curve, so the rejection tests below stay honest when a curve is
    /// retuned. A first curve spread over several lines would leave broken TOML here, which fails
    /// loudly at the parse step rather than passing for the wrong reason.
    fn with_first_curve_replaced(replacement: &str) -> String {
        let start = TUNING_TOML
            .find("\ncurve = [")
            .expect("the file has a curve at the start of a line")
            + 1;
        let end = start
            + TUNING_TOML[start..]
                .find('\n')
                .expect("the curve line ends");
        format!(
            "{}{replacement}{}",
            &TUNING_TOML[..start],
            &TUNING_TOML[end..]
        )
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
        let bad = with_first_curve_replaced("curve = [[45.0, 25], [40.0, 40], [75.0, 70]]");
        let config: TuningConfig =
            toml_edit::de::from_str(&bad).expect("still parses structurally");
        assert!(config.validate().is_err());
    }

    /// Goal: a curve with fewer points than the UI needs to draw a curve is rejected. Method:
    /// collapse a real curve to two points and assert validation fails.
    #[test]
    fn rejects_curve_with_too_few_points() {
        let bad = with_first_curve_replaced("curve = [[45.0, 25], [85.0, 100]]");
        let config: TuningConfig =
            toml_edit::de::from_str(&bad).expect("still parses structurally");
        assert!(config.validate().is_err());
    }

    /// Goal: a curve spanning less than the minimum is rejected, since the UI would draw it as a
    /// cliff. Method: squeeze a real curve into a 10C span and assert validation fails.
    #[test]
    fn rejects_curve_with_narrow_spread() {
        let bad = with_first_curve_replaced("curve = [[45.0, 25], [50.0, 40], [55.0, 100]]");
        let config: TuningConfig =
            toml_edit::de::from_str(&bad).expect("still parses structurally");
        assert!(config.validate().is_err());
    }

    /// Goal: a curve duty above 100% is rejected. Method: bump one curve point past 100 and assert
    /// validation fails.
    #[test]
    fn rejects_duty_over_one_hundred() {
        let bad = with_first_curve_replaced("curve = [[45.0, 25], [60.0, 40], [85.0, 150]]");
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
