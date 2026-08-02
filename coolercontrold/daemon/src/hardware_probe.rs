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

//! Decision rules for the duty-response probe.
//!
//! Pure functions only. This is the one part of hardware support that
//! deliberately moves a fan, so the rules that decide whether to move it, how
//! far, and what the result means are kept separate from the code that touches
//! sysfs, and are tested on their own.
//!
//! Deliberately not built on the calibration diagnoser: that path conflates
//! "no tachometer" with "ignored every duty write" and reports success for
//! both. The precondition below sidesteps that by construction.
//!
//! Unused in release builds until the sysfs orchestration and endpoint land.
//! The rules are committed first on purpose: this is the only part of hardware
//! support that moves a fan, so what it will and will not do is settled and
//! tested before any code writes a duty.
#![allow(dead_code)]

use crate::device::Duty;
use crate::hardware_support::ChannelVerdict;
use std::ops::Not;

/// A fan must move at least this much for the change to count as a response.
/// Fans wander by a few tens of rpm at a fixed duty, so a small absolute floor
/// alone would read noise as success.
const RESPONSE_MIN_RPM_DELTA: u32 = 100;

/// Or this fraction of the baseline, whichever is larger. A 3000 rpm fan can
/// drift more than 100 rpm on its own; a 600 rpm one cannot.
const RESPONSE_MIN_RATIO: f64 = 0.10;

/// Above this duty there is not enough headroom to prove a response by raising,
/// so the probe lowers instead.
const RAISE_HEADROOM_CEILING: Duty = 80;

/// How far to move, in duty percent. Large enough to clear the noise floor on
/// a slow fan, small enough to stay unremarkable.
const PROBE_STEP: Duty = 25;

/// Lowering spins a fan down, so it is gated on temperature. Above this the
/// probe declines rather than reduce cooling on a machine already running warm.
const LOWER_MAX_TEMP_CELSIUS: f64 = 70.0;

/// Why a probe may not run. Every variant is a refusal to touch hardware.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProbeRefusal {
    /// No writable control, so there is nothing to test.
    NotControllable,
    /// No tachometer at all: the response can never be observed.
    NoTachometer,
    /// A tachometer that reads zero is an empty header or a stopped fan, not a
    /// baseline. Probing it would manufacture an `IgnoresDuty` verdict for a
    /// connector with nothing on it.
    NoBaselineRpm,
    /// An alert is active on this channel; moving its fan would confuse the
    /// user's own investigation and could trip further alerts.
    AlertActive,
    /// Near maximum duty, so the probe would have to lower, and the machine is
    /// too warm to reduce cooling.
    TooWarmToLower,
}

/// What the probe intends to do, once it has decided it may.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProbePlan {
    /// The duty to restore afterwards, captured before anything is written.
    pub original_duty: Duty,
    /// The duty to write during the probe.
    pub target_duty: Duty,
    /// True when the probe lowers rather than raises.
    pub lowers: bool,
}

/// Everything the decision needs, gathered by the caller.
#[derive(Debug, Clone, Copy)]
pub struct ProbeConditions {
    pub pwm_writable: bool,
    pub has_tachometer: bool,
    pub baseline_rpm: u32,
    pub current_duty: Duty,
    pub alert_active: bool,
    /// Highest temperature currently reported for the device, when known.
    pub temp_celsius: Option<f64>,
}

/// Decides whether to probe and how.
///
/// Raising is preferred because it is thermally free: a fan briefly spinning
/// faster costs nothing but noise. Lowering is only used when there is no
/// headroom left to raise into, and then only on a cool machine.
pub fn plan_probe(conditions: ProbeConditions) -> Result<ProbePlan, ProbeRefusal> {
    if conditions.pwm_writable.not() {
        return Err(ProbeRefusal::NotControllable);
    }
    if conditions.has_tachometer.not() {
        return Err(ProbeRefusal::NoTachometer);
    }
    if conditions.baseline_rpm == 0 {
        return Err(ProbeRefusal::NoBaselineRpm);
    }
    if conditions.alert_active {
        return Err(ProbeRefusal::AlertActive);
    }
    if conditions.current_duty <= RAISE_HEADROOM_CEILING {
        return Ok(ProbePlan {
            original_duty: conditions.current_duty,
            target_duty: (conditions.current_duty + PROBE_STEP).min(100),
            lowers: false,
        });
    }
    // No headroom to raise into, so the only way to prove a response is down.
    if conditions
        .temp_celsius
        .is_some_and(|temp| temp > LOWER_MAX_TEMP_CELSIUS)
    {
        return Err(ProbeRefusal::TooWarmToLower);
    }
    Ok(ProbePlan {
        original_duty: conditions.current_duty,
        target_duty: conditions.current_duty.saturating_sub(PROBE_STEP),
        lowers: true,
    })
}

/// Whether the fan's speed actually responded.
pub fn rpm_responded(baseline_rpm: u32, observed_rpm: u32) -> bool {
    let threshold = response_threshold(baseline_rpm);
    baseline_rpm.abs_diff(observed_rpm) >= threshold
}

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_precision_loss
)]
fn response_threshold(baseline_rpm: u32) -> u32 {
    let ratio_floor = (f64::from(baseline_rpm) * RESPONSE_MIN_RATIO).round() as u32;
    ratio_floor.max(RESPONSE_MIN_RPM_DELTA)
}

/// Turns what the probe observed into a verdict.
///
/// Order matters: a reclaimed `pwm_enable` explains the lack of response, so it
/// must be checked before concluding the fan ignores duty entirely. Reporting
/// `IgnoresDuty` for an EC that took the channel back would send the user to
/// the wrong documentation.
pub fn interpret_probe(
    manual_mode_held: bool,
    baseline_rpm: u32,
    observed_rpm: u32,
) -> ChannelVerdict {
    if manual_mode_held.not() {
        return ChannelVerdict::FirmwareOverride;
    }
    if rpm_responded(baseline_rpm, observed_rpm) {
        return ChannelVerdict::Controllable;
    }
    ChannelVerdict::IgnoresDuty
}

/// The verdict to record when a probe was refused. Only the two evidence gaps
/// leave the question genuinely open; the rest are already explained.
pub fn refusal_verdict(refusal: ProbeRefusal) -> Option<ChannelVerdict> {
    match refusal {
        ProbeRefusal::NoTachometer | ProbeRefusal::NoBaselineRpm => {
            Some(ChannelVerdict::Unverifiable)
        }
        ProbeRefusal::NotControllable
        | ProbeRefusal::AlertActive
        | ProbeRefusal::TooWarmToLower => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn healthy() -> ProbeConditions {
        ProbeConditions {
            pwm_writable: true,
            has_tachometer: true,
            baseline_rpm: 1000,
            current_duty: 40,
            alert_active: false,
            temp_celsius: Some(45.0),
        }
    }

    /// Goal: the ordinary case raises duty, because raising costs only noise
    /// while lowering costs cooling.
    #[test]
    fn ordinary_probe_raises_duty() {
        let plan = plan_probe(healthy()).unwrap();
        assert_eq!(plan.original_duty, 40);
        assert_eq!(plan.target_duty, 65);
        assert!(plan.lowers.not());
    }

    /// Goal: a tachometer reading zero is an empty header, not a baseline.
    /// Six headers on the validation machine are in exactly that state, and
    /// probing them would invent an IgnoresDuty verdict for each.
    #[test]
    fn zero_rpm_is_not_a_baseline() {
        let conditions = ProbeConditions {
            baseline_rpm: 0,
            ..healthy()
        };
        assert_eq!(plan_probe(conditions), Err(ProbeRefusal::NoBaselineRpm));
        assert_eq!(
            refusal_verdict(ProbeRefusal::NoBaselineRpm),
            Some(ChannelVerdict::Unverifiable)
        );
    }

    /// Goal: with no tachometer the question cannot be settled either way, so
    /// the probe declines rather than reporting success like the calibration
    /// diagnoser does.
    #[test]
    fn missing_tachometer_declines() {
        let conditions = ProbeConditions {
            has_tachometer: false,
            ..healthy()
        };
        assert_eq!(plan_probe(conditions), Err(ProbeRefusal::NoTachometer));
    }

    /// Goal: an active alert means the user is already investigating this
    /// channel; moving its fan would muddy that and could trip more alerts.
    #[test]
    fn active_alert_blocks_the_probe() {
        let conditions = ProbeConditions {
            alert_active: true,
            ..healthy()
        };
        assert_eq!(plan_probe(conditions), Err(ProbeRefusal::AlertActive));
        // Not an evidence gap, so it leaves no verdict behind.
        assert_eq!(refusal_verdict(ProbeRefusal::AlertActive), None);
    }

    /// Goal: near maximum there is no headroom to raise into, so the probe
    /// lowers, but only while the machine is cool enough to spare the cooling.
    #[test]
    fn near_maximum_lowers_only_when_cool() {
        let cool = ProbeConditions {
            current_duty: 95,
            temp_celsius: Some(40.0),
            ..healthy()
        };
        let plan = plan_probe(cool).unwrap();
        assert_eq!(plan.target_duty, 70);
        assert!(plan.lowers);

        let warm = ProbeConditions {
            current_duty: 95,
            temp_celsius: Some(85.0),
            ..healthy()
        };
        assert_eq!(plan_probe(warm), Err(ProbeRefusal::TooWarmToLower));
    }

    /// Goal: raising never exceeds full speed.
    #[test]
    fn raising_clamps_at_full_speed() {
        let conditions = ProbeConditions {
            current_duty: 80,
            ..healthy()
        };
        assert_eq!(plan_probe(conditions).unwrap().target_duty, 100);
    }

    /// Goal: the response threshold scales with the fan. A 3000 rpm fan drifts
    /// more than a 600 rpm one, so a fixed floor alone would read noise as a
    /// response on the fast fan.
    #[test]
    fn response_threshold_scales_with_baseline() {
        assert!(rpm_responded(600, 750));
        assert!(rpm_responded(600, 660).not());
        assert!(rpm_responded(3000, 3150).not());
        assert!(rpm_responded(3000, 3400));
    }

    /// Goal: a reclaimed pwm_enable explains the lack of response, so it must
    /// outrank IgnoresDuty. Reporting the wrong one sends the user to the wrong
    /// documentation.
    #[test]
    fn reclaimed_manual_mode_outranks_ignores_duty() {
        assert_eq!(
            interpret_probe(false, 1000, 1000),
            ChannelVerdict::FirmwareOverride
        );
        assert_eq!(
            interpret_probe(true, 1000, 1000),
            ChannelVerdict::IgnoresDuty
        );
        assert_eq!(
            interpret_probe(true, 1000, 1400),
            ChannelVerdict::Controllable
        );
    }

    /// Goal: an unwritable channel is already explained, so a refused probe
    /// there must not overwrite the verdict that explains it.
    #[test]
    fn uncontrollable_refusal_leaves_the_verdict_alone() {
        let conditions = ProbeConditions {
            pwm_writable: false,
            ..healthy()
        };
        assert_eq!(plan_probe(conditions), Err(ProbeRefusal::NotControllable));
        assert_eq!(refusal_verdict(ProbeRefusal::NotControllable), None);
    }
}
