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
