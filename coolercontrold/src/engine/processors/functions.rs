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

use std::cell::RefCell;
use std::collections::{HashMap, VecDeque};
use std::ops::Not;

use log::{error, trace};
use serde::{Deserialize, Serialize};
use yata::methods::TMA;
use yata::prelude::Method;

use crate::device::Temp;
use crate::engine::{NormalizedGraphProfile, Processor, SpeedProfileData};
use crate::repositories::repository::DeviceLock;
use crate::setting::{FunctionType, ProfileUID};
use crate::AllDevices;

pub const TMA_DEFAULT_WINDOW_SIZE: u8 = 8;
const TEMP_SAMPLE_SIZE: isize = 16;
const MIN_TEMP_HIST_STACK_SIZE: u8 = 2;
const MAX_DUTY_SAMPLE_SIZE: usize = 20;
const DEFAULT_MAX_NO_DUTY_SET_SECONDS: f64 = 30.;
const MIN_NO_DUTY_SET_SECONDS: f64 = 30.;
const MAX_NO_DUTY_SET_SECONDS: f64 = 60.;
const EMERGENCY_MISSING_TEMP: Temp = 100.;

/// The default function returns the source temp as-is.
pub struct FunctionIdentityPreProcessor {
    all_devices: AllDevices,
}

impl FunctionIdentityPreProcessor {
    pub fn new(all_devices: AllDevices) -> Self {
        Self { all_devices }
    }
}

impl Processor for FunctionIdentityPreProcessor {
    fn is_applicable(&self, data: &SpeedProfileData) -> bool {
        data.profile.function.f_type == FunctionType::Identity && data.temp.is_none()
        // preprocessor only
    }

    fn init_state(&self, _: &ProfileUID) {}

    fn clear_state(&self, _: &ProfileUID) {}

    fn process<'a>(&'a self, data: &'a mut SpeedProfileData) -> &'a mut SpeedProfileData {
        let temp_source_device_option = self
            .all_devices
            .get(data.profile.temp_source.device_uid.as_str());
        if temp_source_device_option.is_none() {
            log_missing_temp_device(data);
            data.temp = Some(EMERGENCY_MISSING_TEMP);
            return data;
        }
        data.temp = temp_source_device_option
            .unwrap()
            .borrow()
            .status_history
            .iter()
            .last() // last = latest temp
            .and_then(|status| {
                status
                    .temps
                    .iter()
                    .filter(|temp_status| temp_status.name == data.profile.temp_source.temp_name)
                    .map(|temp_status| temp_status.temp)
                    .next_back()
                    .or_else(|| {
                        log_missing_temp_sensor(data);
                        Some(EMERGENCY_MISSING_TEMP)
                    })
            });
        data
    }
}

/// The standard Function with Hysteresis control
pub struct FunctionStandardPreProcessor {
    all_devices: AllDevices,
    channel_settings_metadata: RefCell<HashMap<ProfileUID, ChannelSettingMetadata>>,
}

impl FunctionStandardPreProcessor {
    pub fn new(all_devices: AllDevices) -> Self {
        Self {
            all_devices,
            channel_settings_metadata: RefCell::new(HashMap::new()),
        }
    }

    fn data_is_sane(data: &SpeedProfileData) -> bool {
        if data.profile.function.response_delay.is_none()
            || data.profile.function.deviance.is_none()
            || data.profile.function.only_downward.is_none()
        {
            error!(
                "All required fields must be set for the standard Function: {:?}, {:?}, {:?}",
                data.profile.function.response_delay,
                data.profile.function.deviance,
                data.profile.function.only_downward,
            );
            return false;
        }
        true
    }

    fn fill_temp_stack(
        metadata: &mut ChannelSettingMetadata,
        data: &mut SpeedProfileData,
        temp_source_device_option: Option<&DeviceLock>,
    ) {
        if temp_source_device_option.is_none() {
            log_missing_temp_device(data);
            if metadata.last_applied_temp == 0. {
                metadata.temp_hist_stack.clear();
            }
            metadata.temp_hist_stack.push_back(EMERGENCY_MISSING_TEMP);
            return;
        }
        let temp_source_device = temp_source_device_option.unwrap().borrow();
        if metadata.last_applied_temp == 0. {
            // this is needed for the first application
            let mut latest_temps = temp_source_device
                .status_history
                .iter()
                .rev() // reverse so that take() takes the latest
                .take(metadata.ideal_stack_size)
                .flat_map(|status| status.temps.as_slice())
                .filter(|temp_status| temp_status.name == data.profile.temp_source.temp_name)
                .map(|temp_status| temp_status.temp)
                .collect::<Vec<f64>>();
            latest_temps.reverse(); // re-order temps to proper Vec order
            if latest_temps.is_empty() {
                log_missing_temp_sensor(data);
                metadata.temp_hist_stack.clear();
                metadata.temp_hist_stack.push_back(EMERGENCY_MISSING_TEMP);
                return;
            }
            metadata.temp_hist_stack.clear();
            metadata.temp_hist_stack.extend(latest_temps);
        } else {
            // the normal operation
            let current_temp = temp_source_device
                .status_history
                .back()
                .and_then(|status| {
                    status
                        .temps
                        .as_slice()
                        .iter()
                        .filter(|temp_status| {
                            temp_status.name == data.profile.temp_source.temp_name
                        })
                        .map(|temp_status| temp_status.temp)
                        .next_back()
                        .or_else(|| {
                            log_missing_temp_sensor(data);
                            Some(EMERGENCY_MISSING_TEMP)
                        })
                })
                .unwrap();
            metadata.temp_hist_stack.push_back(current_temp);
        }
    }

    fn temp_within_tolerance(temp_to_verify: f64, last_applied_temp: f64, deviance: f64) -> bool {
        temp_to_verify <= (last_applied_temp + deviance)
            && temp_to_verify >= (last_applied_temp - deviance)
    }

    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    fn calc_ideal_stack_size(profile: &NormalizedGraphProfile) -> u8 {
        (f64::from(profile.function.response_delay.unwrap()) / profile.poll_rate).ceil() as u8 + 1
    }
}

impl Processor for FunctionStandardPreProcessor {
    fn is_applicable(&self, data: &SpeedProfileData) -> bool {
        data.profile.function.f_type == FunctionType::Standard && data.temp.is_none()
        // preprocessor only
    }

    fn init_state(&self, profile_uid: &ProfileUID) {
        self.channel_settings_metadata
            .borrow_mut()
            .insert(profile_uid.clone(), ChannelSettingMetadata::new());
    }

    fn clear_state(&self, profile_uid: &ProfileUID) {
        self.channel_settings_metadata
            .borrow_mut()
            .remove(profile_uid);
    }

    fn process<'a>(&'a self, data: &'a mut SpeedProfileData) -> &'a mut SpeedProfileData {
        let temp_source_device_option = self
            .all_devices
            .get(data.profile.temp_source.device_uid.as_str());
        if Self::data_is_sane(data).not() {
            return data;
        }

        // setup metadata:
        let mut metadata_lock = self.channel_settings_metadata.borrow_mut();
        let metadata = metadata_lock.get_mut(&data.profile.profile_uid).unwrap();
        if metadata.ideal_stack_size == 0 {
            // set ideal size on initial run:
            metadata.ideal_stack_size =
                MIN_TEMP_HIST_STACK_SIZE.max(Self::calc_ideal_stack_size(&data.profile)) as usize;
        }
        Self::fill_temp_stack(metadata, data, temp_source_device_option);

        if metadata.temp_hist_stack.len() > metadata.ideal_stack_size {
            metadata.temp_hist_stack.pop_front();
        } else if metadata.last_applied_temp == 0.
            && metadata.temp_hist_stack.len() < metadata.ideal_stack_size
        {
            // Very first run after boot/wakeup, let's apply something right away
            let temp_to_apply = metadata.temp_hist_stack.front().copied().unwrap();
            data.temp = Some(temp_to_apply);
            metadata.last_applied_temp = temp_to_apply;
            return data;
        }

        // main processor logic:
        if data.profile.function.only_downward.unwrap() {
            let newest_temp = *metadata.temp_hist_stack.back().unwrap();
            if newest_temp > metadata.last_applied_temp {
                metadata.temp_hist_stack.clear();
                metadata.temp_hist_stack.push_back(newest_temp);
                data.temp = Some(newest_temp);
                metadata.last_applied_temp = newest_temp;
                return data;
            }
        }
        let oldest_temp = metadata.temp_hist_stack.front().copied().unwrap();
        let oldest_temp_within_tolerance = Self::temp_within_tolerance(
            oldest_temp,
            metadata.last_applied_temp,
            data.profile.function.deviance.unwrap(),
        );
        if metadata.temp_hist_stack.len() > MIN_TEMP_HIST_STACK_SIZE as usize {
            let newest_temp_within_tolerance = Self::temp_within_tolerance(
                *metadata.temp_hist_stack.back().unwrap(),
                metadata.last_applied_temp,
                data.profile.function.deviance.unwrap(),
            );
            if oldest_temp_within_tolerance && newest_temp_within_tolerance {
                // normalize the stack, as we want to skip any spikes that happened within the delay period
                let adjust_count = metadata.temp_hist_stack.len() - 1; // we leave the newest temp as is
                metadata
                    .temp_hist_stack
                    .iter_mut()
                    .take(adjust_count)
                    .for_each(|temp| *temp = oldest_temp);
            }
        }
        if oldest_temp_within_tolerance && data.safety_latch_triggered.not() {
            return data; // nothing to apply
        }
        data.temp = Some(oldest_temp);
        metadata.last_applied_temp = oldest_temp;
        data
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelSettingMetadata {
    pub temp_hist_stack: VecDeque<f64>,
    pub ideal_stack_size: usize,
    pub last_applied_temp: f64,
}

impl ChannelSettingMetadata {
    pub fn new() -> Self {
        Self {
            temp_hist_stack: VecDeque::new(),
            ideal_stack_size: 0,
            last_applied_temp: 0.,
        }
    }
}

/// The EMA function calculates an Exponential Moving Average over recent temperatures and
/// returns the most recent value. (Dynamically affected by temp history)
pub struct FunctionEMAPreProcessor {
    all_devices: AllDevices,
}

impl FunctionEMAPreProcessor {
    pub fn new(all_devices: AllDevices) -> Self {
        Self { all_devices }
    }

    /// Computes an exponential moving average from give temps and returns the final/current value from that average.
    /// Exponential moving average gives the most recent values more weight. This is particularly helpful
    /// for setting duty for dynamic temperature sources like CPU. (Good reaction but also averaging)
    /// Will panic if `sample_size` is 0.
    /// Rounded to the nearest 100th decimal place
    fn current_temp_from_exponential_moving_average(
        all_temps: &[f64],
        window_size: Option<u8>,
    ) -> f64 {
        (TMA::new_over(
            window_size.unwrap_or(TMA_DEFAULT_WINDOW_SIZE),
            Self::get_temps_slice(all_temps),
        )
        .unwrap()
        .last()
        .unwrap()
            * 100.)
            .round()
            / 100.
    }

    #[allow(clippy::cast_possible_wrap, clippy::cast_sign_loss)]
    fn get_temps_slice(all_temps: &[f64]) -> &[f64] {
        // keeping the sample size low allows the average to be more forward-aggressive,
        // otherwise the actual reading and the EMA take quite a while before they are the same value
        // todo: we could auto-size the sample size, if the window is larger than the default sample size,
        //  but should test what the actual outcome with be and if that's a realistic value for users.
        let sample_delta = all_temps.len() as isize - TEMP_SAMPLE_SIZE;
        if sample_delta > 0 {
            all_temps.split_at(sample_delta as usize).1
        } else {
            all_temps
        }
    }
}

impl Processor for FunctionEMAPreProcessor {
    fn is_applicable(&self, data: &SpeedProfileData) -> bool {
        data.profile.function.f_type == FunctionType::ExponentialMovingAvg && data.temp.is_none()
        // preprocessor only
    }

    fn init_state(&self, _: &ProfileUID) {}

    fn clear_state(&self, _: &ProfileUID) {}

    fn process<'a>(&'a self, data: &'a mut SpeedProfileData) -> &'a mut SpeedProfileData {
        let temp_source_device_option = self
            .all_devices
            .get(data.profile.temp_source.device_uid.as_str());
        if temp_source_device_option.is_none() {
            log_missing_temp_device(data);
            data.temp = Some(EMERGENCY_MISSING_TEMP);
            return data;
        }
        let mut temps = {
            // scoped for the device read lock
            let temp_source_device = temp_source_device_option.unwrap().borrow();
            temp_source_device
                .status_history
                .iter()
                .rev() // reverse so that take() takes the end part
                // we only need the last (sample_size ) temps for EMA:
                .take(TEMP_SAMPLE_SIZE as usize)
                .flat_map(|status| status.temps.as_slice())
                .filter(|temp_status| temp_status.name == data.profile.temp_source.temp_name)
                .map(|temp_status| temp_status.temp)
                .collect::<Vec<f64>>()
        };
        temps.reverse(); // re-order temps so last temp is again last
        data.temp = if temps.is_empty() {
            log_missing_temp_sensor(data);
            Some(EMERGENCY_MISSING_TEMP)
        } else {
            Some(Self::current_temp_from_exponential_moving_average(
                &temps,
                data.profile.function.sample_window,
            ))
        };
        data
    }
}

/// This post-processor keeps a set of last-applied-duties and applies only duties within set upper and
/// lower thresholds. It also handles improvements for edge cases.
pub struct FunctionDutyThresholdPostProcessor {
    scheduled_settings_metadata: RefCell<HashMap<ProfileUID, DutySettingMetadata>>,
}

impl FunctionDutyThresholdPostProcessor {
    pub fn new() -> Self {
        Self {
            scheduled_settings_metadata: RefCell::new(HashMap::new()),
        }
    }

    fn duty_within_thresholds(&self, data: &SpeedProfileData) -> Option<u8> {
        if self.scheduled_settings_metadata.borrow()[&data.profile.profile_uid]
            .last_manual_speeds_set
            .is_empty()
        {
            return data.duty; // first application (startup)
        }
        let last_duty = self.get_appropriate_last_duty(&data.profile.profile_uid);
        let diff_to_last_duty = data.duty.unwrap().abs_diff(last_duty);
        if diff_to_last_duty < data.profile.function.duty_minimum
            && data.safety_latch_triggered.not()
        {
            None
        } else if diff_to_last_duty > data.profile.function.duty_maximum {
            Some(if data.duty.unwrap() < last_duty {
                last_duty - data.profile.function.duty_maximum
            } else {
                last_duty + data.profile.function.duty_maximum
            })
        } else {
            data.duty
        }
    }

    /// This returns the last duty that was set manually. This used to also do extra work to
    /// determine if it was a true value of the device, but with the introduction of the
    /// safety-latch, that is superfluous.
    fn get_appropriate_last_duty(&self, profile_uid: &ProfileUID) -> u8 {
        *self.scheduled_settings_metadata.borrow()[profile_uid]
            .last_manual_speeds_set
            .back()
            .unwrap() // already checked to exist
    }
}

impl Processor for FunctionDutyThresholdPostProcessor {
    fn is_applicable(&self, data: &SpeedProfileData) -> bool {
        data.duty.is_some()
    }

    fn init_state(&self, profile_uid: &ProfileUID) {
        self.scheduled_settings_metadata
            .borrow_mut()
            .insert(profile_uid.clone(), DutySettingMetadata::new());
    }

    fn clear_state(&self, profile_uid: &ProfileUID) {
        self.scheduled_settings_metadata
            .borrow_mut()
            .remove(profile_uid);
    }

    fn process<'a>(&'a self, data: &'a mut SpeedProfileData) -> &'a mut SpeedProfileData {
        if let Some(duty_to_set) = self.duty_within_thresholds(data) {
            {
                let mut metadata_lock = self.scheduled_settings_metadata.borrow_mut();
                let metadata = metadata_lock.get_mut(&data.profile.profile_uid).unwrap();
                metadata.last_manual_speeds_set.push_back(duty_to_set);
                if metadata.last_manual_speeds_set.len() > MAX_DUTY_SAMPLE_SIZE {
                    metadata.last_manual_speeds_set.pop_front();
                }
            }
            data.duty = Some(duty_to_set);
            data
        } else {
            data.duty = None;
            trace!("Duty not above threshold to be applied to device. Skipping");
            trace!(
                "Last applied duties: {:?}",
                self.scheduled_settings_metadata.borrow()[&data.profile.profile_uid]
                    .last_manual_speeds_set
            );
            data
        }
    }
}

/// This is used to help in deciding exactly when to apply a setting
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DutySettingMetadata {
    /// (internal use) the last duty speeds that we set manually. This keeps track of applied settings
    /// to not re-apply the same setting over and over again needlessly. eg: [20, 25, 30]
    #[serde(skip_serializing, skip_deserializing)]
    pub last_manual_speeds_set: VecDeque<u8>,
}

impl DutySettingMetadata {
    pub fn new() -> Self {
        Self {
            last_manual_speeds_set: VecDeque::with_capacity(MAX_DUTY_SAMPLE_SIZE + 1),
        }
    }
}

/// This processor handles a so-called Safety-Latch. The makes sure that actual fan profile targets
/// are hit, regardless of thresholds set. It also makes sure that the device is actually doing
/// what it should. This processor needs to run at both the start and end of the processing chain.
pub struct FunctionSafetyLatchProcessor {
    scheduled_settings_metadata: RefCell<HashMap<ProfileUID, SafetyLatchMetadata>>,
}

impl FunctionSafetyLatchProcessor {
    pub fn new() -> Self {
        Self {
            scheduled_settings_metadata: RefCell::new(HashMap::new()),
        }
    }

    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    fn initial_max_no_duty_set_count(profile: &NormalizedGraphProfile) -> u8 {
        if profile.function.response_delay.is_some() {
            let response_delay_secs = f64::from(profile.function.response_delay.unwrap());
            let response_delay_count = response_delay_secs / profile.poll_rate;
            // use response_delay but within a reasonable limit
            let min_count = (MIN_NO_DUTY_SET_SECONDS / profile.poll_rate).ceil();
            let max_count = (MAX_NO_DUTY_SET_SECONDS / profile.poll_rate).ceil();
            response_delay_count.clamp(min_count, max_count) as u8
        } else {
            (DEFAULT_MAX_NO_DUTY_SET_SECONDS / profile.poll_rate).ceil() as u8
        }
    }
}

impl Processor for FunctionSafetyLatchProcessor {
    fn is_applicable(&self, _data: &SpeedProfileData) -> bool {
        // applies to all function types (they all have a minimum duty change setting)
        true
    }

    fn init_state(&self, profile_uid: &ProfileUID) {
        self.scheduled_settings_metadata
            .borrow_mut()
            .insert(profile_uid.clone(), SafetyLatchMetadata::new());
    }

    fn clear_state(&self, profile_uid: &ProfileUID) {
        self.scheduled_settings_metadata
            .borrow_mut()
            .remove(profile_uid);
    }

    fn process<'a>(&'a self, data: &'a mut SpeedProfileData) -> &'a mut SpeedProfileData {
        let mut metadata_lock = self.scheduled_settings_metadata.borrow_mut();
        let metadata = metadata_lock.get_mut(&data.profile.profile_uid).unwrap();
        if data.processing_started.not() {
            // Check whether to trigger the latch at the start of processing
            if metadata.max_no_duty_set_count == 0 {
                // first run, set the max_count
                metadata.max_no_duty_set_count = Self::initial_max_no_duty_set_count(&data.profile);
            }
            if metadata.no_duty_set_counter >= metadata.max_no_duty_set_count {
                data.safety_latch_triggered = true;
            }
            data.processing_started = true;
            return data;
        }
        // end of processing logic
        if data.duty.is_some() {
            metadata.no_duty_set_counter = 0;
        } else {
            if data.safety_latch_triggered {
                error!("No Duty Set AND Safety latch triggered. This should not happen.");
            }
            metadata.no_duty_set_counter += 1;
        }
        data
    }
}

/// Metadata used for the Safety Latch
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyLatchMetadata {
    /// (internal use) a counter to be able to know how many times the to-be-applied duty was under
    /// the various processor thresholds. This will help hit the target profile duty regardless of
    /// various threshold settings
    #[serde(skip_serializing, skip_deserializing)]
    pub no_duty_set_counter: u8,

    /// The max count allowed for a particular channel's settings configuration
    #[serde(skip_serializing, skip_deserializing)]
    pub max_no_duty_set_count: u8,
}

impl SafetyLatchMetadata {
    pub fn new() -> Self {
        Self {
            // This will force the SafetyLatch to trigger on latch initialization. (such as when
            // applying the profile to a second device channel)
            no_duty_set_counter: u8::MAX,
            max_no_duty_set_count: 0,
        }
    }
}

fn log_missing_temp_device(data: &SpeedProfileData) {
    error!(
        "Temperature Source Device: {} is missing for Profile: {}, \
         using emergency default temp: {EMERGENCY_MISSING_TEMP}C",
        data.profile.temp_source.device_uid, data.profile.profile_name,
    );
}

fn log_missing_temp_sensor(data: &SpeedProfileData) {
    error!(
        "Temperature Sensor: {} - {} is missing for Profile: {}, \
         using emergency default temp: {EMERGENCY_MISSING_TEMP}C",
        data.profile.temp_source.device_uid,
        data.profile.temp_source.temp_name,
        data.profile.profile_name,
    );
}

#[cfg(test)]
mod tests {
    use crate::engine::processors::functions::FunctionEMAPreProcessor;

    #[test]
    #[allow(clippy::float_cmp)]
    fn current_temp_from_exponential_moving_average_test() {
        let given_expected: Vec<(&[f64], f64)> = vec![
            // these are just samples. Tested with real hardware for expected results,
            // which are not so clear in numbers here.
            (&[20., 25.], 20.05),
            (&[20., 25., 30., 90., 90., 90., 30., 30., 30., 30.], 35.86),
            (&[30., 30., 30., 30.], 30.),
        ];
        for (given, expected) in given_expected {
            assert_eq!(
                FunctionEMAPreProcessor::current_temp_from_exponential_moving_average(given, None),
                expected
            );
        }
    }
}
