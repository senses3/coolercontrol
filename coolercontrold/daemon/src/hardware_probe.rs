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
//! The orchestration at the bottom is the only impure part, and it reaches
//! hardware exclusively through [`ProbeHost`] so the sequence can be tested
//! without a fan.

use crate::calibration::SettingsSnapshot;
use crate::device::{DeviceUID, Duty, RPM};
use crate::hardware_support::ChannelVerdict;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
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

/// Duties tried in order when the fan is stopped and has to be started.
///
/// One step proves nothing here. Start thresholds vary widely between fans and
/// plenty need more than a quarter duty to break away, so a single 25% attempt
/// writes off fans that work perfectly at 40%. The last rung is full duty,
/// which is what lets a failure be conclusive instead of inconclusive: a fan
/// that will not turn at 100% is disconnected, blocked or dead.
const START_LADDER: [Duty; 3] = [30, 60, 100];

/// The ladder has to end at full duty or its failure means nothing.
const _: () = assert!(START_LADDER[START_LADDER.len() - 1] == 100);

/// Lowering spins a fan down, so it is gated on temperature. Above this the
/// probe declines rather than reduce cooling on a machine already running warm.
const LOWER_MAX_TEMP_CELSIUS: f64 = 70.0;

/// How often to look at the channel while a write is taking effect.
const POLL_INTERVAL_MS: u32 = 500;

/// Consecutive fresh samples with no change in either duty or speed before a
/// rung counts as finished.
///
/// This replaced a fixed sleep, which was the wrong instrument: some boards
/// ramp the reported duty towards the target over several seconds rather than
/// applying it at once, and sampling once after a guessed delay gave up while
/// the fan was still on its way up. Watching until nothing moves tracks the
/// board's own pace, and on hardware that applies a write immediately it
/// finishes sooner than any sleep long enough for the slow case.
const STABLE_SAMPLES: u32 = 3;

/// Hard cap per rung, so a channel whose readings never settle cannot hold the
/// request open indefinitely.
const RUNG_TIMEOUT_MS: u32 = 20_000;

const _: () = assert!(POLL_INTERVAL_MS > 0);
const _: () = assert!(RUNG_TIMEOUT_MS > POLL_INTERVAL_MS * STABLE_SAMPLES);
const _: () = assert!(PROBE_STEP > 0);
const _: () = assert!(RAISE_HEADROOM_CEILING < 100);

/// Why a probe may not run. Every variant is a refusal to touch hardware.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ProbeRefusal {
    /// No writable control, so there is nothing to test.
    NotControllable,
    /// No tachometer at all: the response can never be observed.
    NoTachometer,
    /// An alert is active on this channel; moving its fan would confuse the
    /// user's own investigation and could trip further alerts.
    AlertActive,
    /// Near maximum duty, so the probe would have to lower, and the machine is
    /// too warm to reduce cooling.
    TooWarmToLower,
}

/// What the probe intends to do, once it has decided it may.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProbePlan {
    /// The duty to restore afterwards, captured before anything is written.
    pub original_duty: Duty,
    /// Duties to write in order, stopping at the first one the fan answers.
    ///
    /// One entry for a fan that is already turning, where a single step is
    /// enough to see the speed change. The whole ladder for a stopped one,
    /// because the question there is whether it starts at all.
    pub steps: Vec<Duty>,
    /// True when the probe lowers rather than raises.
    pub lowers: bool,
}

impl ProbePlan {
    /// Whether the last rung was full duty, which is what makes a fan that
    /// never turned a conclusion rather than an open question.
    fn ends_at_full_duty(&self) -> bool {
        self.steps.last() == Some(&100)
    }
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
    if conditions.alert_active {
        return Err(ProbeRefusal::AlertActive);
    }
    if conditions.baseline_rpm == 0 {
        // Nothing is turning, so there is no speed change to look for. The
        // question is whether the fan starts at all, and only full duty can
        // answer that in the negative. Cheap on an empty header, too: writing
        // duty to a connector with nothing on it moves nothing.
        return Ok(ProbePlan {
            original_duty: conditions.current_duty,
            steps: START_LADDER.to_vec(),
            lowers: false,
        });
    }
    if conditions.current_duty <= RAISE_HEADROOM_CEILING {
        return Ok(ProbePlan {
            original_duty: conditions.current_duty,
            steps: vec![(conditions.current_duty + PROBE_STEP).min(100)],
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
        steps: vec![conditions.current_duty.saturating_sub(PROBE_STEP)],
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
pub fn interpret_probe(observation: ProbeObservation) -> ChannelVerdict {
    if observation.manual_mode_held.not() {
        return ChannelVerdict::FirmwareOverride;
    }
    if rpm_responded(observation.baseline_rpm, observation.observed_rpm) {
        return ChannelVerdict::Controllable;
    }
    if observation.baseline_rpm > 0 {
        // It was turning and kept turning at the same speed: the writes land
        // and something else is deciding the speed.
        return ChannelVerdict::IgnoresDuty;
    }
    if observation.reached_full_duty {
        // Full duty and still nothing. The control path works, so this is not
        // `IgnoresDuty`; there is simply no working fan on the other end.
        return ChannelVerdict::FanDoesNotSpin;
    }
    // The ladder stopped short, so the question is still open.
    ChannelVerdict::Unverifiable
}

/// Everything the verdict is derived from, gathered by the probe run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProbeObservation {
    pub manual_mode_held: bool,
    pub baseline_rpm: RPM,
    pub observed_rpm: RPM,
    /// Whether the last duty written was full. Only then does a fan that never
    /// turned mean anything conclusive.
    pub reached_full_duty: bool,
}

/// The verdict to record when a probe was refused. Only the two evidence gaps
/// leave the question genuinely open; the rest are already explained.
pub fn refusal_verdict(refusal: ProbeRefusal) -> Option<ChannelVerdict> {
    match refusal {
        ProbeRefusal::NoTachometer => Some(ChannelVerdict::Unverifiable),
        ProbeRefusal::NotControllable
        | ProbeRefusal::AlertActive
        | ProbeRefusal::TooWarmToLower => None,
    }
}

/// What one probe request produced.
///
/// `Declined` is a result, not an error: "we will not move this fan, and here
/// is why" is exactly the kind of observation this feature exists to state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "outcome", rename_all = "snake_case")]
pub enum ProbeOutcome {
    /// The fan was moved and the response observed.
    Completed {
        verdict: ChannelVerdict,
        baseline_rpm: RPM,
        observed_rpm: RPM,
        original_duty: Duty,
        probed_duty: Duty,
    },
    /// Nothing was written to hardware.
    Declined {
        reason: ProbeRefusal,
        /// The verdict the refusal itself establishes, when it establishes
        /// one. Absent means the channel's existing verdict already explains
        /// it and must not be overwritten.
        #[serde(skip_serializing_if = "Option::is_none")]
        verdict: Option<ChannelVerdict>,
    },
}

impl ProbeOutcome {
    fn declined(reason: ProbeRefusal) -> Self {
        Self::Declined {
            reason,
            verdict: refusal_verdict(reason),
        }
    }

    /// The verdict to publish, if this outcome establishes one.
    pub fn verdict(&self) -> Option<ChannelVerdict> {
        match self {
            Self::Completed { verdict, .. } => Some(*verdict),
            Self::Declined { verdict, .. } => *verdict,
        }
    }
}

/// Everything the probe needs from the running daemon.
///
/// Split out so the sequence below can be tested without hardware. The
/// snapshot and restore pair is the calibration one: the probe deliberately
/// does not reuse the diagnoser's *algorithm*, but there is only one correct
/// way to put a channel's setting back, and duplicating it would be a second
/// place for restore bugs to live.
#[async_trait(?Send)]
pub trait ProbeHost {
    /// `None` when the channel is unknown to the daemon or reports no duty,
    /// in which case there is nothing to plan against.
    async fn gather_conditions(
        &self,
        device_uid: &DeviceUID,
        channel_name: &str,
    ) -> Option<ProbeConditions>;

    fn snapshot_setting(&self, device_uid: &DeviceUID, channel_name: &str) -> SettingsSnapshot;

    async fn restore_setting(&self, snapshot: &SettingsSnapshot) -> Result<()>;

    async fn enter_manual_control(&self, device_uid: &DeviceUID, channel_name: &str) -> Result<()>;

    async fn write_duty(
        &self,
        device_uid: &DeviceUID,
        channel_name: &str,
        duty: Duty,
    ) -> Result<()>;

    async fn current_rpm(&self, device_uid: &DeviceUID, channel_name: &str) -> Option<RPM>;

    /// The duty the channel currently *reports*, which is not always the duty
    /// last written: boards that ramp report the value on its way to the
    /// target. Watched so the probe can tell "still arriving" from "arrived
    /// and nothing happened".
    async fn current_duty(&self, device_uid: &DeviceUID, channel_name: &str) -> Option<Duty>;

    /// Timestamp of the newest status, watched so the RPM sample is known to
    /// come from a refresh that happened after the write.
    async fn latest_status_timestamp_ms(&self, device_uid: &DeviceUID) -> Option<i64>;

    /// Whether the channel is still in the mode `enter_manual_control` set.
    ///
    /// `None` from a driver that exposes no such mode. That is evidence
    /// *against* a firmware override rather than for it: with no auto mode to
    /// revert to, there is nothing for firmware to reclaim the channel into.
    async fn manual_control_held(&self, device_uid: &DeviceUID, channel_name: &str)
        -> Option<bool>;

    async fn sleep_millis(&self, millis: u32);
}

/// Runs one duty-response probe on one channel.
///
/// The fan is always put back: the restore runs before any failure from the
/// observation is propagated, so a write that fails halfway never leaves the
/// channel at a duty the user did not ask for.
pub async fn run_probe<H: ProbeHost + ?Sized>(
    host: &H,
    device_uid: &DeviceUID,
    channel_name: &str,
) -> Result<ProbeOutcome> {
    let conditions = host
        .gather_conditions(device_uid, channel_name)
        .await
        .ok_or_else(|| anyhow!("no probeable channel {channel_name} on {device_uid}"))?;
    let plan = match plan_probe(conditions) {
        Ok(plan) => plan,
        Err(refusal) => return Ok(ProbeOutcome::declined(refusal)),
    };
    debug_assert!(
        plan.steps.is_empty().not(),
        "a plan with nothing to write proves nothing"
    );
    let snapshot = host.snapshot_setting(device_uid, channel_name);
    let run = walk_the_plan(
        host,
        device_uid,
        channel_name,
        &plan,
        conditions.baseline_rpm,
    )
    .await;
    let restored = restore_channel(
        host,
        device_uid,
        channel_name,
        plan.original_duty,
        &snapshot,
    )
    .await;
    let run = run?;
    restored?;
    let observation = ProbeObservation {
        manual_mode_held: run.manual_mode_held,
        baseline_rpm: conditions.baseline_rpm,
        observed_rpm: run.observed_rpm,
        reached_full_duty: plan.ends_at_full_duty() && run.probed_duty == 100,
    };
    Ok(ProbeOutcome::Completed {
        verdict: interpret_probe(observation),
        baseline_rpm: conditions.baseline_rpm,
        observed_rpm: run.observed_rpm,
        original_duty: plan.original_duty,
        probed_duty: run.probed_duty,
    })
}

/// What one run of the plan actually saw.
struct ProbeRun {
    observed_rpm: RPM,
    /// The last duty written, which is where `observed_rpm` was measured.
    probed_duty: Duty,
    manual_mode_held: bool,
}

/// Asserts control, then writes each duty in turn until the fan answers.
///
/// Stops at the first rung that produces a response, so a fan that starts at
/// the bottom of the ladder is never driven to full duty just to prove a point.
async fn walk_the_plan<H: ProbeHost + ?Sized>(
    host: &H,
    device_uid: &DeviceUID,
    channel_name: &str,
    plan: &ProbePlan,
    baseline_rpm: RPM,
) -> Result<ProbeRun> {
    host.enter_manual_control(device_uid, channel_name).await?;
    let mut observed_rpm = 0;
    let mut probed_duty = plan.original_duty;
    for &duty in &plan.steps {
        host.write_duty(device_uid, channel_name, duty).await?;
        probed_duty = duty;
        let rung = watch_rung(host, device_uid, channel_name, baseline_rpm).await?;
        observed_rpm = rung.rpm;
        if rung.responded {
            break;
        }
    }
    // Free here and only here: control has already been asserted and the probe
    // is a one-shot user action, so this read never reaches the write path.
    let manual_mode_held = host
        .manual_control_held(device_uid, channel_name)
        .await
        .unwrap_or(true);
    Ok(ProbeRun {
        observed_rpm,
        probed_duty,
        manual_mode_held,
    })
}

/// Puts the channel back exactly as it was found.
///
/// The stored setting alone is not enough. Restoring an *unmanaged* channel
/// only hands control back to the firmware; it writes no duty at all, so the
/// raw pwm keeps the last value the probe wrote. On a board whose driver is
/// not managing that header, nothing then overwrites it and the fan sits at
/// the probe duty indefinitely, which is the one thing this probe must never
/// do. So the duty goes back first, while manual control is still held, and
/// the setting after it. Where the setting does drive a duty of its own, that
/// write simply supersedes this one.
///
/// Both halves are attempted before either failure is reported: a channel left
/// half restored is worse than one that reports the first thing that went
/// wrong.
async fn restore_channel<H: ProbeHost + ?Sized>(
    host: &H,
    device_uid: &DeviceUID,
    channel_name: &str,
    original_duty: Duty,
    snapshot: &SettingsSnapshot,
) -> Result<()> {
    let duty_restored = host
        .write_duty(device_uid, channel_name, original_duty)
        .await;
    let setting_restored = host.restore_setting(snapshot).await;
    duty_restored?;
    setting_restored
}

/// How one rung ended.
struct RungOutcome {
    rpm: RPM,
    /// True when the fan answered, which ends the ladder here.
    responded: bool,
}

/// Watches a channel after a write until the fan answers or nothing is moving.
///
/// Only samples that come from a *new* status are considered, so a cache that
/// has not refreshed yet can never be mistaken for a channel that has settled.
async fn watch_rung<H: ProbeHost + ?Sized>(
    host: &H,
    device_uid: &DeviceUID,
    channel_name: &str,
    baseline_rpm: RPM,
) -> Result<RungOutcome> {
    let polls_max = RUNG_TIMEOUT_MS / POLL_INTERVAL_MS;
    let mut seen_status_ms = host.latest_status_timestamp_ms(device_uid).await;
    let mut previous: Option<(Option<Duty>, RPM)> = None;
    let mut unchanged = 0;
    let mut rpm = None;
    for _ in 0..polls_max {
        host.sleep_millis(POLL_INTERVAL_MS).await;
        let status_ms = host.latest_status_timestamp_ms(device_uid).await;
        if status_ms == seen_status_ms {
            continue; // nothing new to read yet
        }
        seen_status_ms = status_ms;
        let Some(sampled_rpm) = host.current_rpm(device_uid, channel_name).await else {
            continue;
        };
        rpm = Some(sampled_rpm);
        if rpm_responded(baseline_rpm, sampled_rpm) {
            return Ok(RungOutcome {
                rpm: sampled_rpm,
                responded: true,
            });
        }
        let sample = (
            host.current_duty(device_uid, channel_name).await,
            sampled_rpm,
        );
        // A duty still climbing towards the target means the write is being
        // applied gradually, and the fan has not had its chance yet.
        if previous == Some(sample) {
            unchanged += 1;
        } else {
            unchanged = 0;
        }
        previous = Some(sample);
        if unchanged >= STABLE_SAMPLES {
            break;
        }
    }
    let rpm = rpm.ok_or_else(|| anyhow!("no fan speed reading after the probe write"))?;
    Ok(RungOutcome {
        rpm,
        responded: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::calibration::SnapshotKind;
    use std::cell::{Cell, RefCell};

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
        assert_eq!(plan.steps, vec![65]);
        assert!(plan.lowers.not());
    }

    /// Goal: a stopped fan gets a ladder, not one attempt. Start thresholds
    /// vary and plenty of fans need more than a quarter duty to break away, so
    /// a single 25% try writes off fans that work fine at 40%.
    #[test]
    fn a_stopped_fan_gets_the_whole_ladder() {
        for current_duty in [0, 40] {
            let conditions = ProbeConditions {
                baseline_rpm: 0,
                current_duty,
                ..healthy()
            };
            let plan = plan_probe(conditions).unwrap();
            assert_eq!(plan.original_duty, current_duty);
            assert_eq!(plan.steps, START_LADDER.to_vec());
            assert!(plan.ends_at_full_duty());
        }
    }

    /// Goal: the ladder's rungs must climb and finish at full duty. A ladder
    /// that stopped short could never turn a silent fan into a conclusion.
    #[test]
    fn the_ladder_climbs_to_full_duty() {
        assert!(START_LADDER.windows(2).all(|pair| pair[0] < pair[1]));
        assert_eq!(START_LADDER.last(), Some(&100));
    }

    /// Goal: full duty with nothing turning is conclusive, and it is not
    /// IgnoresDuty. The writes landed and the control path works; there is no
    /// working fan on the end of it, which is a different problem with a
    /// different answer.
    #[test]
    fn no_spin_at_full_duty_is_conclusive() {
        assert_eq!(
            interpret_probe(observed(0, 0, true)),
            ChannelVerdict::FanDoesNotSpin
        );
    }

    /// Goal: a ladder that stopped short leaves the question open rather than
    /// condemning a fan that simply was not asked hard enough.
    #[test]
    fn no_spin_below_full_duty_stays_open() {
        assert_eq!(
            interpret_probe(observed(0, 0, false)),
            ChannelVerdict::Unverifiable
        );
    }

    /// Goal: a stopped fan that does start is just controllable.
    #[test]
    fn a_fan_that_starts_is_controllable() {
        assert_eq!(
            interpret_probe(observed(0, 800, true)),
            ChannelVerdict::Controllable
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
        assert_eq!(plan.steps, vec![70]);
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
        assert_eq!(plan_probe(conditions).unwrap().steps, vec![100]);
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

    fn observed(baseline_rpm: RPM, observed_rpm: RPM, reached_full_duty: bool) -> ProbeObservation {
        ProbeObservation {
            manual_mode_held: true,
            baseline_rpm,
            observed_rpm,
            reached_full_duty,
        }
    }

    /// Goal: a reclaimed pwm_enable explains the lack of response, so it must
    /// outrank IgnoresDuty. Reporting the wrong one sends the user to the wrong
    /// documentation.
    #[test]
    fn reclaimed_manual_mode_outranks_ignores_duty() {
        let reclaimed = ProbeObservation {
            manual_mode_held: false,
            ..observed(1000, 1000, false)
        };
        assert_eq!(interpret_probe(reclaimed), ChannelVerdict::FirmwareOverride);
        assert_eq!(
            interpret_probe(observed(1000, 1000, false)),
            ChannelVerdict::IgnoresDuty
        );
        assert_eq!(
            interpret_probe(observed(1000, 1400, false)),
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

    /// Records every hardware touch so the tests can assert on the sequence
    /// rather than only on the returned verdict. The fan responds by a fixed
    /// amount per duty point unless configured otherwise.
    #[derive(Default)]
    struct MockHost {
        conditions: Option<ProbeConditions>,
        rpm_after_write: Option<RPM>,
        manual_held: Option<bool>,
        manual_write_fails: bool,
        duty_write_fails: bool,
        restore_fails: bool,
        /// Advances on every read, so a fresh status always lands.
        status_ms: Cell<i64>,
        /// What the channel reports as its duty. Unchanging by default.
        reported_duty: Cell<Option<Duty>>,
        /// Fresh samples a write takes to actually arrive. Zero applies it at
        /// once; higher values imitate a board that ramps the duty.
        ramp_samples: u32,
        /// Fresh samples seen since the last write.
        samples_since_write: Cell<u32>,
        writes: RefCell<Vec<String>>,
    }

    impl MockHost {
        fn responsive() -> Self {
            Self {
                conditions: Some(healthy()),
                rpm_after_write: Some(1500),
                ..Self::default()
            }
        }

        fn log(&self, entry: &str) {
            self.writes.borrow_mut().push(entry.to_string());
        }

        fn touched(&self) -> Vec<String> {
            self.writes.borrow().clone()
        }
    }

    #[async_trait(?Send)]
    impl ProbeHost for MockHost {
        async fn gather_conditions(&self, _: &DeviceUID, _: &str) -> Option<ProbeConditions> {
            self.conditions
        }

        fn snapshot_setting(&self, device_uid: &DeviceUID, channel_name: &str) -> SettingsSnapshot {
            SettingsSnapshot {
                device_uid: device_uid.clone(),
                channel_name: channel_name.to_string(),
                kind: SnapshotKind::Manual(40),
            }
        }

        async fn restore_setting(&self, _: &SettingsSnapshot) -> Result<()> {
            self.log("restore");
            if self.restore_fails {
                return Err(anyhow!("restore failed"));
            }
            Ok(())
        }

        async fn enter_manual_control(&self, _: &DeviceUID, _: &str) -> Result<()> {
            self.log("manual");
            if self.manual_write_fails {
                return Err(anyhow!("manual failed"));
            }
            Ok(())
        }

        async fn write_duty(&self, _: &DeviceUID, _: &str, duty: Duty) -> Result<()> {
            self.log(&format!("duty:{duty}"));
            self.samples_since_write.set(0);
            if self.duty_write_fails {
                return Err(anyhow!("duty write failed"));
            }
            Ok(())
        }

        async fn current_rpm(&self, _: &DeviceUID, _: &str) -> Option<RPM> {
            let seen = self.samples_since_write.get() + 1;
            self.samples_since_write.set(seen);
            if seen <= self.ramp_samples {
                // Still on its way to the written duty, so the fan has not had
                // its chance yet.
                return Some(0);
            }
            self.rpm_after_write
        }

        async fn current_duty(&self, _: &DeviceUID, _: &str) -> Option<Duty> {
            let seen = self.samples_since_write.get();
            if seen <= self.ramp_samples {
                // Climbing, so every sample differs from the last and the rung
                // keeps watching.
                #[allow(clippy::cast_possible_truncation)]
                return Some((seen * 5).min(100) as Duty);
            }
            self.reported_duty.get()
        }

        async fn latest_status_timestamp_ms(&self, _: &DeviceUID) -> Option<i64> {
            let next = self.status_ms.get() + 1000;
            self.status_ms.set(next);
            Some(next)
        }

        async fn manual_control_held(&self, _: &DeviceUID, _: &str) -> Option<bool> {
            self.manual_held
        }

        async fn sleep_millis(&self, _: u32) {}
    }

    fn probe(host: &MockHost) -> Result<ProbeOutcome> {
        crate::rt::test_runtime(async { run_probe(host, &"dev-1".to_string(), "fan1").await })
    }

    /// Goal: a fan that speeds up when told to is controllable, and the probe
    /// leaves the channel on the setting it found.
    #[test]
    fn responding_fan_reports_controllable_and_restores() {
        let host = MockHost::responsive();
        let outcome = probe(&host).unwrap();
        assert_eq!(
            outcome,
            ProbeOutcome::Completed {
                verdict: ChannelVerdict::Controllable,
                baseline_rpm: 1000,
                observed_rpm: 1500,
                original_duty: 40,
                probed_duty: 65,
            }
        );
        assert_eq!(
            host.touched(),
            vec!["manual", "duty:65", "duty:40", "restore"]
        );
    }

    /// Goal: writes that all succeed while the fan never moves is the exact
    /// case passive evidence cannot settle, and the only thing that may
    /// produce IgnoresDuty.
    #[test]
    fn unmoving_fan_reports_ignores_duty() {
        let host = MockHost {
            rpm_after_write: Some(1010),
            manual_held: Some(true),
            ..MockHost::responsive()
        };
        assert_eq!(
            probe(&host).unwrap().verdict(),
            Some(ChannelVerdict::IgnoresDuty)
        );
    }

    /// Goal: a driver with no mode to reclaim must not be read as a firmware
    /// override. Absence of pwm_enable is evidence against, never for.
    #[test]
    fn absent_manual_mode_is_not_an_override() {
        let host = MockHost {
            manual_held: None,
            ..MockHost::responsive()
        };
        assert_eq!(
            probe(&host).unwrap().verdict(),
            Some(ChannelVerdict::Controllable)
        );
    }

    /// Goal: the fan goes back even when the probe itself fails. A failed
    /// write must never strand a channel at the probe duty.
    #[test]
    fn failed_write_still_restores_the_setting() {
        let host = MockHost {
            duty_write_fails: true,
            ..MockHost::responsive()
        };
        assert!(probe(&host).is_err());
        assert_eq!(
            host.touched(),
            vec!["manual", "duty:65", "duty:40", "restore"]
        );
    }

    /// Goal: a restore that fails leaves the fan somewhere the user did not
    /// choose, so it must surface rather than being masked by a verdict.
    #[test]
    fn failed_restore_surfaces_over_the_verdict() {
        let host = MockHost {
            restore_fails: true,
            ..MockHost::responsive()
        };
        assert!(probe(&host).is_err());
    }

    /// Goal: no reading means no conclusion. Reporting 0 rpm here would
    /// manufacture IgnoresDuty out of a transient read failure.
    #[test]
    fn missing_reading_never_becomes_a_verdict() {
        let host = MockHost {
            rpm_after_write: None,
            ..MockHost::responsive()
        };
        assert!(probe(&host).is_err());
        assert!(
            host.touched().contains(&"restore".to_string()),
            "the restore must still run"
        );
    }

    /// Goal: a refusal touches no hardware at all, and carries the verdict it
    /// establishes so the caller does not have to re-derive it.
    #[test]
    fn refusal_writes_nothing() {
        let host = MockHost {
            conditions: Some(ProbeConditions {
                has_tachometer: false,
                ..healthy()
            }),
            ..MockHost::responsive()
        };
        let outcome = probe(&host).unwrap();
        assert_eq!(
            outcome,
            ProbeOutcome::Declined {
                reason: ProbeRefusal::NoTachometer,
                verdict: Some(ChannelVerdict::Unverifiable),
            }
        );
        assert!(host.touched().is_empty(), "a refusal must not write");
    }

    /// Goal: the ladder stops the moment the fan answers. A fan that starts at
    /// 30% must never be driven to full duty just to prove a point the probe
    /// has already proved.
    #[test]
    fn the_ladder_stops_at_the_first_rung_that_works() {
        let host = MockHost {
            conditions: Some(ProbeConditions {
                baseline_rpm: 0,
                current_duty: 0,
                ..healthy()
            }),
            rpm_after_write: Some(700),
            ..MockHost::responsive()
        };
        let outcome = probe(&host).unwrap();
        assert_eq!(outcome.verdict(), Some(ChannelVerdict::Controllable));
        assert_eq!(
            host.touched(),
            vec!["manual", "duty:30", "duty:0", "restore"]
        );
    }

    /// Goal: a board that applies a write gradually must not be given up on.
    /// Some boards ramp the reported duty towards the target over seconds, and
    /// a fixed sleep sampled once while the fan was still on its way up, then
    /// moved to the next rung. Method: a host that takes six fresh samples to
    /// arrive, after which the fan turns. The first rung must carry it.
    #[test]
    fn a_ramping_board_is_waited_out() {
        let host = MockHost {
            conditions: Some(ProbeConditions {
                baseline_rpm: 0,
                current_duty: 0,
                ..healthy()
            }),
            rpm_after_write: Some(800),
            ramp_samples: 6,
            ..MockHost::responsive()
        };
        let outcome = probe(&host).unwrap();
        assert_eq!(outcome.verdict(), Some(ChannelVerdict::Controllable));
        assert_eq!(
            host.touched(),
            vec!["manual", "duty:30", "duty:0", "restore"],
            "the ramp must be waited out on the first rung, not escalated past"
        );
    }

    /// Goal: a rung ends once nothing is moving, rather than burning its whole
    /// timeout on a channel that has plainly finished. Method: a host that
    /// reports the same duty and speed every sample.
    #[test]
    fn a_settled_channel_ends_its_rung_early() {
        let host = MockHost {
            conditions: Some(ProbeConditions {
                baseline_rpm: 0,
                current_duty: 0,
                ..healthy()
            }),
            rpm_after_write: Some(0),
            ..MockHost::responsive()
        };
        probe(&host).unwrap();
        let polls_max = RUNG_TIMEOUT_MS / POLL_INTERVAL_MS;
        assert!(
            STABLE_SAMPLES < polls_max,
            "a rung must be able to settle before its timeout"
        );
    }

    /// Goal: the duty the channel was found at is written back, not just the
    /// stored setting. Restoring an unmanaged channel only hands control to the
    /// firmware and writes no duty, so on a board whose driver is not managing
    /// that header the raw pwm kept the probe's last value and the fan sat at
    /// full duty afterwards. Observed on real hardware: a second probe reported
    /// `original_duty: 100` on a channel the user had left at 0.
    #[test]
    fn the_duty_goes_back_not_just_the_setting() {
        let host = MockHost {
            conditions: Some(ProbeConditions {
                baseline_rpm: 0,
                current_duty: 0,
                ..healthy()
            }),
            rpm_after_write: Some(0),
            ..MockHost::responsive()
        };
        probe(&host).unwrap();
        let touched = host.touched();
        let restore_at = touched.iter().position(|entry| entry == "restore").unwrap();
        assert_eq!(
            touched[restore_at - 1],
            "duty:0",
            "the original duty must be written back while manual control is \
             still held, before the setting is handed back: {touched:?}"
        );
    }

    /// Goal: pin the exact JSON the UI has to decode. The wire shape is the
    /// contract between the daemon and the app, and a mismatch there is
    /// invisible to both sides' own tests.
    #[test]
    fn the_wire_shape_is_what_the_app_expects() {
        let outcome = ProbeOutcome::Completed {
            verdict: ChannelVerdict::FanDoesNotSpin,
            baseline_rpm: 0,
            observed_rpm: 0,
            original_duty: 0,
            probed_duty: 100,
        };
        let json = serde_json::to_string(&outcome).unwrap();
        println!("WIRE: {json}");
        assert!(json.contains("\"outcome\":\"completed\""), "{json}");
        assert!(json.contains("\"verdict\":\"fan_does_not_spin\""), "{json}");
    }

    /// Goal: a fan that answers no rung is walked all the way to full duty and
    /// then condemned. Stopping short would leave the user with an open
    /// question about a header that is demonstrably dead.
    #[test]
    fn a_silent_fan_is_walked_to_full_duty() {
        let host = MockHost {
            conditions: Some(ProbeConditions {
                baseline_rpm: 0,
                current_duty: 0,
                ..healthy()
            }),
            rpm_after_write: Some(0),
            ..MockHost::responsive()
        };
        let outcome = probe(&host).unwrap();
        assert_eq!(outcome.verdict(), Some(ChannelVerdict::FanDoesNotSpin));
        assert_eq!(
            host.touched(),
            vec!["manual", "duty:30", "duty:60", "duty:100", "duty:0", "restore"]
        );
    }

    /// Goal: an unknown channel is an error, not a silent verdict about
    /// hardware nobody looked at.
    #[test]
    fn unknown_channel_is_an_error() {
        let host = MockHost {
            conditions: None,
            ..MockHost::responsive()
        };
        assert!(probe(&host).is_err());
    }
}
