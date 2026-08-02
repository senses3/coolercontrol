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
use log::warn;
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

/// How long to let the fan reach its new speed before sampling. Generous
/// enough for a slow 140mm fan, which takes longer to spin up than the status
/// cache takes to refresh.
const SETTLE_MS: u32 = 5_000;

/// The same, per rung of the start ladder. Shorter on purpose: a fan that is
/// going to break away does so almost at once, and the ladder only asks
/// whether it turned at all rather than what speed it settled to. Waiting the
/// full time on every rung would treble how long the request is held open.
const START_SETTLE_MS: u32 = 2_500;

const _: () = assert!(START_SETTLE_MS < SETTLE_MS);

/// After settling, the sample still has to come from a status refresh that
/// happened after the write, or it would report the pre-write speed.
const FRESH_STATUS_POLL_MS: u32 = 500;

/// Bound on that wait. A device whose statuses stopped refreshing entirely
/// must not hold the probe open forever; the sample is taken anyway and the
/// stale reading simply fails to clear the response threshold.
const FRESH_STATUS_ATTEMPTS_MAX: u32 = 10;

const _: () = assert!(FRESH_STATUS_POLL_MS > 0);
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
    /// How long to wait after each write before sampling.
    fn settle_ms(&self) -> u32 {
        if self.steps.len() > 1 {
            return START_SETTLE_MS;
        }
        SETTLE_MS
    }

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
    let restored = host.restore_setting(&snapshot).await;
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
    let settle_ms = plan.settle_ms();
    let mut observed_rpm = 0;
    let mut probed_duty = plan.original_duty;
    for &duty in &plan.steps {
        host.write_duty(device_uid, channel_name, duty).await?;
        probed_duty = duty;
        observed_rpm = settle_and_sample(host, device_uid, channel_name, settle_ms)
            .await
            .ok_or_else(|| anyhow!("no fan speed reading after the probe write"))?;
        if rpm_responded(baseline_rpm, observed_rpm) {
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

/// Waits for the fan to reach its new speed, then for a status refresh that
/// postdates the write, then samples.
async fn settle_and_sample<H: ProbeHost + ?Sized>(
    host: &H,
    device_uid: &DeviceUID,
    channel_name: &str,
    settle_ms: u32,
) -> Option<RPM> {
    let before_ms = host.latest_status_timestamp_ms(device_uid).await;
    host.sleep_millis(settle_ms).await;
    for _ in 0..FRESH_STATUS_ATTEMPTS_MAX {
        if host.latest_status_timestamp_ms(device_uid).await != before_ms {
            return host.current_rpm(device_uid, channel_name).await;
        }
        host.sleep_millis(FRESH_STATUS_POLL_MS).await;
    }
    warn!("Duty-response probe saw no status refresh for {device_uid}; sampling anyway");
    host.current_rpm(device_uid, channel_name).await
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
            if self.duty_write_fails {
                return Err(anyhow!("duty write failed"));
            }
            Ok(())
        }

        async fn current_rpm(&self, _: &DeviceUID, _: &str) -> Option<RPM> {
            self.rpm_after_write
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
        assert_eq!(host.touched(), vec!["manual", "duty:65", "restore"]);
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
        assert_eq!(host.touched(), vec!["manual", "duty:65", "restore"]);
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
        assert_eq!(host.touched(), vec!["manual", "duty:30", "restore"]);
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
            vec!["manual", "duty:30", "duty:60", "duty:100", "restore"]
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
