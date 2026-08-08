// SPDX-FileCopyrightText: 2022 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
use crate::device::Duty;

pub mod graph;
pub mod lcd;
pub mod mix;
pub mod overlay;

/// Default tick count before the safety latch forces a re-application.
/// Matches the Graph commander's default of 30 seconds at 1s poll rate.
const DEFAULT_SAFETY_LATCH_COUNT: u8 = 30;

/// Tracks output deduplication state per profile. When the computed duty is
/// unchanged between ticks, the hardware write is suppressed. After
/// `DEFAULT_SAFETY_LATCH_COUNT` consecutive suppressions the write is forced
/// through (safety latch) to re-verify hardware compliance.
pub struct OutputDedupState {
    last_applied_duty: Option<Duty>,
    no_change_counter: u8,
}

impl OutputDedupState {
    pub fn new() -> Self {
        Self {
            last_applied_duty: None,
            // Force immediate application on first use.
            no_change_counter: DEFAULT_SAFETY_LATCH_COUNT,
        }
    }

    /// Returns `true` when the duty should be written to hardware.
    pub fn should_apply(&mut self, duty: Duty) -> bool {
        debug_assert!(duty <= 100, "duty must be in 0..=100 range");
        if self.last_applied_duty == Some(duty) {
            if self.no_change_counter >= DEFAULT_SAFETY_LATCH_COUNT {
                // Safety latch: allow write through, reset counter.
                self.no_change_counter = 0;
                return true;
            }
            self.no_change_counter += 1;
            return false;
        }
        // Duty changed: apply immediately.
        self.last_applied_duty = Some(duty);
        self.no_change_counter = 0;
        true
    }
}
