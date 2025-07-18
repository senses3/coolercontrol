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
use std::collections::HashMap;
use std::rc::Rc;
use std::string::ToString;

use anyhow::{anyhow, Error, Result};
use async_trait::async_trait;
use heck::ToTitleCase;
use log::{debug, error, info, trace};
use tokio::time::Instant;

use crate::api::CCError;
use crate::config::Config;
use crate::device::{
    Device, DeviceInfo, DeviceType, DriverInfo, DriverType, Status, TempInfo, TempStatus, UID,
};
use crate::repositories::repository::{DeviceList, DeviceLock, Repository};
use crate::setting::{
    CustomSensor, CustomSensorMixFunctionType, CustomSensorType, LcdSettings, LightingSettings,
    TempSource,
};
use crate::{cc_fs, VERSION};

const MAX_CUSTOM_SENSOR_FILE_SIZE_BYTES: usize = 15;

type CustomSensors = Rc<RefCell<Vec<CustomSensor>>>;

/// A Repository for Custom Sensors defined by the user
pub struct CustomSensorsRepo {
    config: Rc<Config>,
    custom_sensor_device: Option<DeviceLock>,
    all_devices: HashMap<UID, DeviceLock>,
    sensors: CustomSensors,
}

impl CustomSensorsRepo {
    pub fn new(config: Rc<Config>, all_other_devices: DeviceList) -> Self {
        let mut all_devices = HashMap::new();
        for device in all_other_devices {
            let uid = device.borrow().uid.clone();
            all_devices.insert(uid, device);
        }
        Self {
            config,
            custom_sensor_device: None,
            all_devices,
            sensors: Rc::new(RefCell::new(Vec::new())),
        }
    }

    pub fn get_device_uid(&self) -> UID {
        self.custom_sensor_device
            .as_ref()
            .expect("Custom Sensor Device should always be present after initialization")
            .borrow()
            .uid
            .clone()
    }

    pub fn get_custom_sensor(&self, custom_sensor_id: &str) -> Result<CustomSensor> {
        self.sensors
            .borrow()
            .iter()
            .find(|cs| cs.id == custom_sensor_id)
            .cloned()
            .ok_or_else(|| {
                CCError::NotFound {
                    msg: format!("Custom Sensor not found: {custom_sensor_id}"),
                }
                .into()
            })
    }

    pub fn get_custom_sensors(&self) -> Vec<CustomSensor> {
        self.sensors.borrow().clone()
    }

    pub fn set_custom_sensors_order(&self, custom_sensors: &[CustomSensor]) -> Result<()> {
        self.config.set_custom_sensor_order(custom_sensors)?;
        self.sensors.borrow_mut().clear();
        self.sensors.borrow_mut().extend(custom_sensors.to_vec());
        Ok(())
    }

    pub async fn set_custom_sensor(&self, custom_sensor: CustomSensor) -> Result<()> {
        self.fill_status_history_for_new_sensor(&custom_sensor)
            .await
            .inspect_err(|err| {
                error!("Failed to fill status history for new Custom Sensor: {err}");
            })?;
        self.config.set_custom_sensor(custom_sensor.clone())?;
        self.sensors.borrow_mut().push(custom_sensor);
        self.update_device_info_temps();
        Ok(())
    }

    pub async fn update_custom_sensor(&self, custom_sensor: CustomSensor) -> Result<()> {
        if custom_sensor.cs_type == CustomSensorType::File {
            // Make sure the file exists and temp is properly formatted
            Self::get_custom_sensor_file_temp(&custom_sensor).await?;
        }
        self.config.update_custom_sensor(custom_sensor.clone())?;
        {
            let mut sensors = self.sensors.borrow_mut();
            // find check is done in the config update
            let pos = sensors
                .iter()
                .position(|s| s.id == custom_sensor.id)
                .expect("Custom Sensor not found");
            sensors[pos] = custom_sensor;
        }
        Ok(())
    }

    pub fn delete_custom_sensor(&self, custom_sensor_id: &str) -> Result<()> {
        self.config.delete_custom_sensor(custom_sensor_id)?;
        Self::remove_status_history_for_sensor(self, custom_sensor_id);
        self.sensors
            .borrow_mut()
            .retain(|cs| cs.id != custom_sensor_id);
        self.update_device_info_temps();
        Ok(())
    }

    #[allow(clippy::cast_possible_truncation)]
    fn update_device_info_temps(&self) {
        let temp_infos = self
            .sensors
            .borrow()
            .iter()
            .enumerate()
            .map(|(index, cs)| {
                (
                    cs.id.clone(),
                    TempInfo {
                        label: cs.id.to_title_case(),
                        number: index as u8 + 1,
                    },
                )
            })
            .collect();
        self.custom_sensor_device
            .as_ref()
            .unwrap()
            .borrow_mut()
            .info
            .temps = temp_infos;
    }

    /// The function `fill_status_history_for_new_sensor` updates the status history of the
    /// custom sensor device.
    ///
    /// Arguments:
    ///
    /// * `sensor`: The `sensor` parameter is of type `CustomSensor`, which is a struct representing
    ///   a custom sensor.
    ///
    /// Returns: a `Result<()>`.
    async fn fill_status_history_for_new_sensor(&self, sensor: &CustomSensor) -> Result<()> {
        let mut status_history = self
            .custom_sensor_device
            .as_ref()
            .unwrap()
            .borrow()
            .status_history
            .clone();
        match sensor.cs_type {
            CustomSensorType::Mix => {
                for (index, status) in status_history.iter_mut().enumerate() {
                    let temp_status = self.process_custom_sensor_data_mix_indexed(sensor, index)?;
                    status.temps.push(temp_status);
                }
            }
            CustomSensorType::File => {
                Self::get_custom_sensor_file_temp(sensor).await?; // make sure it's valid
                let current_temp_status =
                    Self::process_custom_sensor_data_file_current(sensor).await;
                let status_history_last_index = status_history.len() - 1;
                for (index, status) in status_history.iter_mut().enumerate() {
                    if index == status_history_last_index {
                        status.temps.push(current_temp_status.clone());
                    } else {
                        status.temps.push(TempStatus {
                            temp: 0.,
                            ..current_temp_status.clone()
                        });
                    }
                }
            }
        }
        self.custom_sensor_device
            .as_ref()
            .unwrap()
            .borrow_mut()
            .status_history = status_history;
        Ok(())
    }

    /// The function `process_custom_sensor_data_mix_indexed` processes custom sensor data by retrieving
    /// temperature values from different sources and applying a mixing function to calculate a custom
    /// temperature value.
    ///
    /// Arguments:
    ///
    /// * `sensor`: A reference to a `CustomSensor` object, which contains information about the
    ///   sensor and its sources.
    /// * `index`: The `index` parameter represents the index of the status history that you want to
    ///   retrieve the temperature data from. It is used to access the temperature data at a specific
    ///   point in time.
    ///
    /// Returns: a `Result<TempStatus>`.
    fn process_custom_sensor_data_mix_indexed(
        &self,
        sensor: &CustomSensor,
        index: usize,
    ) -> Result<TempStatus> {
        let mut temp_data = Vec::new();
        for custom_temp_source_data in &sensor.sources {
            let temp_source = &custom_temp_source_data.temp_source;
            let Some(temp_source_device) = self.all_devices.get(&temp_source.device_uid) else {
                continue;
            };
            let some_temp = temp_source_device
                .borrow()
                .status_history
                .get(index)
                .and_then(|status| Self::get_temp_from_status(&temp_source.temp_name, status));
            if some_temp.is_none() {
                let msg = format!(
                    "Temp not found for Custom Sensor: {}:{}",
                    temp_source.device_uid, temp_source.temp_name
                );
                return Err(CCError::InternalError { msg }.into());
            }
            temp_data.push(TempData {
                temp: some_temp.unwrap(),
                weight: f64::from(custom_temp_source_data.weight),
            });
        }
        if temp_data.is_empty() {
            temp_data.push(TempData {
                temp: 0.,
                weight: 1.,
            });
            debug!(
                "No temp data found for Custom Sensor: {}. Filling with zeros",
                sensor.id
            );
        }
        let custom_temp = Self::process_temp_data(&sensor.mix_function, &temp_data);
        Ok(TempStatus {
            name: sensor.id.clone(),
            temp: custom_temp,
        })
    }

    /// The function processes current sensor data by mixing the current temperature values from
    /// different sources based on a specified mixing function.
    ///
    /// Arguments:
    ///
    /// * `sensor`: The `sensor` parameter is of type `&CustomSensor`, which is a reference to a
    ///   `CustomSensor` object.
    ///
    /// Returns: an `TempStatus`
    fn process_custom_sensor_data_mix_current(&self, sensor: &CustomSensor) -> TempStatus {
        let mut temp_data = Vec::new();
        for custom_temp_source_data in &sensor.sources {
            let temp_source = &custom_temp_source_data.temp_source;
            let Some(temp_source_device) = self.all_devices.get(&temp_source.device_uid) else {
                continue;
            };
            let some_temp = temp_source_device
                .borrow()
                .status_history
                .back()
                .and_then(|status| Self::get_temp_from_status(&temp_source.temp_name, status));
            if some_temp.is_none() {
                error!(
                    "Temp not found for Custom Sensor: {}:{}",
                    temp_source.device_uid, temp_source.temp_name
                );
                continue;
            }
            temp_data.push(TempData {
                temp: some_temp.unwrap(),
                weight: f64::from(custom_temp_source_data.weight),
            });
        }
        if temp_data.is_empty() {
            temp_data.push(TempData {
                temp: 0.,
                weight: 1.,
            });
            debug!(
                "No temp data found for Custom Sensor: {}. Filling with zeros",
                sensor.id
            );
        }
        let custom_temp = Self::process_temp_data(&sensor.mix_function, &temp_data);
        TempStatus {
            name: sensor.id.clone(),
            temp: custom_temp,
        }
    }

    fn get_temp_from_status(temp_source_name: &str, status: &Status) -> Option<f64> {
        status
            .temps
            .iter()
            .filter(|temp_status| temp_status.name == temp_source_name)
            .map(|temp_status| temp_status.temp)
            .next_back()
    }

    fn process_temp_data(
        mix_function: &CustomSensorMixFunctionType,
        temp_data: &[TempData],
    ) -> f64 {
        match mix_function {
            CustomSensorMixFunctionType::Min => Self::process_mix_min(temp_data),
            CustomSensorMixFunctionType::Max => Self::process_mix_max(temp_data),
            CustomSensorMixFunctionType::Delta => Self::process_mix_delta(temp_data),
            CustomSensorMixFunctionType::Avg => Self::process_mix_avg(temp_data),
            CustomSensorMixFunctionType::WeightedAvg => Self::process_mix_weighted_avg(temp_data),
        }
    }

    fn process_mix_min(temp_data: &[TempData]) -> f64 {
        temp_data.iter().fold(254., |acc, data| data.temp.min(acc))
    }

    fn process_mix_max(temp_data: &[TempData]) -> f64 {
        temp_data.iter().fold(0., |acc, data| data.temp.max(acc))
    }

    fn process_mix_delta(temp_data: &[TempData]) -> f64 {
        if temp_data.is_empty() {
            return 0.;
        }
        let mut min = 105.;
        let mut max = 0.;
        for data in temp_data {
            if data.temp < min {
                min = data.temp;
            }
            if data.temp > max {
                max = data.temp;
            }
        }
        (max - min).abs()
    }

    #[allow(clippy::cast_precision_loss)]
    fn process_mix_avg(temp_data: &[TempData]) -> f64 {
        if temp_data.is_empty() {
            return 0.;
        }
        temp_data.iter().fold(0., |acc, data| acc + data.temp) / temp_data.len() as f64
    }

    fn process_mix_weighted_avg(temp_data: &[TempData]) -> f64 {
        if temp_data.is_empty() {
            return 0.;
        }
        temp_data
            .iter()
            .fold(
                TempData {
                    temp: 0.,
                    weight: 0.,
                },
                |mut acc, data| {
                    let total_weight = acc.weight + data.weight;
                    acc.temp = (acc.temp * acc.weight + data.temp * data.weight) / total_weight;
                    acc.weight = total_weight;
                    acc
                },
            )
            .temp
    }

    async fn process_custom_sensor_data_file_current(sensor: &CustomSensor) -> TempStatus {
        let current_temp = Self::get_custom_sensor_file_temp(sensor)
            .await
            .unwrap_or(0.);
        TempStatus {
            name: sensor.id.clone(),
            temp: current_temp,
        }
    }

    async fn get_custom_sensor_file_temp(sensor: &CustomSensor) -> Result<f64> {
        let Some(path) = sensor.file_path.as_ref() else {
            return Err(anyhow!(
                "File path not present for custom sensor: {}",
                sensor.id
            ));
        };
        cc_fs::read_sysfs(path)
            .await
            .map_err(Self::verify_file_exists)
            .and_then(Self::verify_file_size)
            .and_then(Self::verify_i32)
            .and_then(Self::verify_temp_value)
    }

    fn verify_file_exists(err: Error) -> Error {
        for cause in err.chain() {
            if let Some(io_err) = cause.downcast_ref::<std::io::Error>() {
                if io_err.kind() == std::io::ErrorKind::NotFound {
                    return CCError::UserError {
                        msg: "File not found".to_string(),
                    }
                    .into();
                }
            }
        }
        err
    }

    fn verify_file_size(content: String) -> Result<String> {
        if content.len() > MAX_CUSTOM_SENSOR_FILE_SIZE_BYTES {
            Err(CCError::UserError {
                msg: format!(
                    "File size too large: {:?} bytes. Max allowed: {:?} bytes",
                    content.len(),
                    MAX_CUSTOM_SENSOR_FILE_SIZE_BYTES
                ),
            }
            .into())
        } else {
            Ok(content)
        }
    }

    #[allow(clippy::needless_pass_by_value)]
    fn verify_i32(content: String) -> Result<i32> {
        content.trim().parse::<i32>().map_err(|err| {
            CCError::UserError {
                msg: format!("{err}"),
            }
            .into()
        })
    }

    fn verify_temp_value(temp: i32) -> Result<f64> {
        //  temps should be in millidegrees:
        if (0..=120_000).contains(&temp) {
            Ok(f64::from(temp) / 1000.0f64)
        } else {
            Err(CCError::UserError {
                msg: format!("File does not contain a reasonable temperature: {temp}"),
            }
            .into())
        }
    }

    fn remove_status_history_for_sensor(&self, sensor_id: &str) {
        let mut device_lock = self.custom_sensor_device.as_ref().unwrap().borrow_mut();
        for status in &mut device_lock.status_history {
            status
                .temps
                .retain(|temp_status| temp_status.name != sensor_id);
        }
    }
}

#[async_trait(?Send)]
impl Repository for CustomSensorsRepo {
    fn device_type(&self) -> DeviceType {
        DeviceType::CustomSensors
    }

    #[allow(clippy::cast_possible_truncation)]
    async fn initialize_devices(&mut self) -> Result<()> {
        debug!("Starting Device Initialization");
        let start_initialization = Instant::now();
        let poll_rate = self.config.get_settings()?.poll_rate;
        let custom_sensors = self.config.get_custom_sensors()?;
        let temp_infos = custom_sensors
            .iter()
            .enumerate()
            .map(|(index, cs)| {
                (
                    cs.id.clone(),
                    TempInfo {
                        label: cs.id.to_title_case(),
                        number: index as u8 + 1,
                    },
                )
            })
            .collect();
        let custom_sensor_device = Rc::new(RefCell::new(Device::new(
            "Custom Sensors".to_string(),
            DeviceType::CustomSensors,
            1,
            None,
            DeviceInfo {
                temps: temp_infos,
                temp_min: 0,
                temp_max: 100,
                profile_max_length: 21,
                driver_info: DriverInfo {
                    drv_type: DriverType::CoolerControl,
                    name: Some("CustomSensors".to_string()),
                    version: Some(VERSION.to_string()),
                    locations: Vec::new(),
                },
                ..Default::default()
            },
            None,
            poll_rate,
        )));
        // not allowed to blacklist this device, otherwise things can get strange
        self.custom_sensor_device = Some(custom_sensor_device);
        self.sensors.borrow_mut().extend(custom_sensors);
        self.update_statuses().await?;
        let recent_status = self
            .custom_sensor_device
            .as_ref()
            .unwrap()
            .borrow()
            .status_current()
            .unwrap();
        self.custom_sensor_device
            .as_ref()
            .unwrap()
            .borrow_mut()
            .initialize_status_history_with(recent_status, poll_rate);
        if log::max_level() == log::LevelFilter::Debug {
            info!(
                "Initialized Custom Sensors Device: {:?}",
                self.custom_sensor_device.as_ref().unwrap().borrow()
            );
        } else {
            info!(
                "Initialized Custom Sensors: {:?}",
                self.sensors
                    .borrow()
                    .iter()
                    .map(|d| d.id.clone())
                    .collect::<Vec<String>>()
            );
        }
        trace!(
            "Time taken to initialize CUSTOM_SENSORS device: {:?}",
            start_initialization.elapsed()
        );
        debug!("CUSTOM_SENSOR Repository initialized");
        Ok(())
    }

    async fn devices(&self) -> DeviceList {
        if let Some(device) = self.custom_sensor_device.as_ref() {
            vec![device.clone()]
        } else {
            Vec::new()
        }
    }

    /// For composite/sensor repos, there is no need to preload as other device statuses
    /// have already been updated.
    async fn preload_statuses(self: Rc<Self>) {}

    async fn update_statuses(&self) -> Result<()> {
        if self.custom_sensor_device.is_none() {
            return Ok(());
        }
        let start_update = Instant::now();
        let mut custom_temps = Vec::new();
        let mut file_sensors = Vec::new();
        for sensor in self.sensors.borrow().iter() {
            match sensor.cs_type {
                CustomSensorType::Mix => {
                    let temp_status = self.process_custom_sensor_data_mix_current(sensor);
                    custom_temps.push(temp_status);
                }
                CustomSensorType::File => {
                    // clone used here to avoid holding the lock over an await:
                    file_sensors.push(sensor.clone());
                }
            }
        }
        for sensor in &file_sensors {
            let temp_status = Self::process_custom_sensor_data_file_current(sensor).await;
            custom_temps.push(temp_status);
        }
        self.custom_sensor_device
            .as_ref()
            .unwrap()
            .borrow_mut()
            .set_status(Status {
                temps: custom_temps,
                ..Default::default()
            });
        trace!(
            "STATUS SNAPSHOT Time taken for CUSTOM_SENSORS device: {:?}",
            start_update.elapsed()
        );
        Ok(())
    }

    async fn shutdown(&self) -> Result<()> {
        info!("CUSTOM_SENSORS Repository shutdown");
        Ok(())
    }

    async fn apply_setting_reset(&self, _device_uid: &UID, _channel_name: &str) -> Result<()> {
        Ok(())
    }

    async fn apply_setting_manual_control(
        &self,
        _device_uid: &UID,
        _channel_name: &str,
    ) -> Result<()> {
        Err(anyhow!(
            "Applying settings is not supported for CUSTOMER_SENSORS devices"
        ))
    }

    async fn apply_setting_speed_fixed(
        &self,
        _device_uid: &UID,
        _channel_name: &str,
        _speed_fixed: u8,
    ) -> Result<()> {
        Err(anyhow!(
            "Applying settings Speed Fixed is not supported for CUSTOMER_SENSORS devices"
        ))
    }
    async fn apply_setting_speed_profile(
        &self,
        _device_uid: &UID,
        _channel_name: &str,
        _temp_source: &TempSource,
        _speed_profile: &[(f64, u8)],
    ) -> Result<()> {
        Err(anyhow!(
            "Applying settings Speed Profile is not supported for CUSTOMER_SENSORS devices"
        ))
    }
    async fn apply_setting_lighting(
        &self,
        _device_uid: &UID,
        _channel_name: &str,
        _lighting: &LightingSettings,
    ) -> Result<()> {
        Err(anyhow!(
            "Applying settings Lighting is not supported for CUSTOMER_SENSORS devices"
        ))
    }
    async fn apply_setting_lcd(
        &self,
        _device_uid: &UID,
        _channel_name: &str,
        _lcd: &LcdSettings,
    ) -> Result<()> {
        Err(anyhow!(
            "Applying settings LCD is not supported for CUSTOMER_SENSORS devices"
        ))
    }
    async fn apply_setting_pwm_mode(
        &self,
        _device_uid: &UID,
        _channel_name: &str,
        _pwm_mode: u8,
    ) -> Result<()> {
        Err(anyhow!(
            "Applying settings pwm_mode is not supported for CUSTOMER_SENSORS devices"
        ))
    }

    async fn reinitialize_devices(&self) {
        error!("Reinitializing Devices is not supported for this Repository");
    }
}

struct TempData {
    temp: f64,
    weight: f64,
}

#[cfg(test)]
mod tests {
    use crate::cc_fs;
    use crate::repositories::custom_sensors_repo::{CustomSensorsRepo, TempData};
    use crate::setting::{CustomSensor, CustomSensorMixFunctionType, CustomSensorType};
    use serial_test::serial;
    use std::path::Path;

    // Calculates the delta between the minimum and maximum temperature values in the given vector of TempData.
    #[test]
    #[allow(clippy::float_cmp)]
    fn test_calculate_delta() {
        let temp_data = vec![
            TempData {
                temp: 10.0,
                weight: 1.0,
            },
            TempData {
                temp: 5.0,
                weight: 1.0,
            },
            TempData {
                temp: 8.0,
                weight: 1.0,
            },
        ];
        let result = CustomSensorsRepo::process_mix_delta(&temp_data);
        assert_eq!(result, 5.0);
    }

    // Returns the absolute value of the delta.
    #[test]
    #[allow(clippy::float_cmp)]
    fn test_absolute_value() {
        let temp_data = vec![
            TempData {
                temp: 10.0,
                weight: 1.0,
            },
            TempData {
                temp: 5.0,
                weight: 1.0,
            },
            TempData {
                temp: 8.0,
                weight: 1.0,
            },
        ];
        let result = CustomSensorsRepo::process_mix_delta(&temp_data);
        assert_eq!(result.abs(), result);
    }

    // Returns 0.0 if the given vector of TempData is empty.
    #[test]
    #[allow(clippy::float_cmp)]
    fn test_empty_vector() {
        let temp_data = vec![];
        let result = CustomSensorsRepo::process_mix_delta(&temp_data);
        assert_eq!(result, 0.0);
    }

    // Returns 0.0 if all temperature values in the given vector of TempData are the same.
    #[test]
    #[allow(clippy::float_cmp)]
    fn test_same_temperatures() {
        let temp_data = vec![
            TempData {
                temp: 10.0,
                weight: 1.0,
            },
            TempData {
                temp: 10.0,
                weight: 1.0,
            },
            TempData {
                temp: 10.0,
                weight: 1.0,
            },
        ];
        let result = CustomSensorsRepo::process_mix_delta(&temp_data);
        assert_eq!(result, 0.0);
    }

    // Returns the difference between the only two temperature values in the given vector of TempData if it contains exactly two elements.
    #[test]
    #[allow(clippy::float_cmp)]
    fn test_two_elements() {
        let temp_data = vec![
            TempData {
                temp: 10.0,
                weight: 1.0,
            },
            TempData {
                temp: 5.0,
                weight: 1.0,
            },
        ];
        let result = CustomSensorsRepo::process_mix_delta(&temp_data);
        assert_eq!(result, 5.0);
    }

    // Returns the minimum temperature from a vector of temperature data.
    #[test]
    #[allow(clippy::float_cmp)]
    fn returns_minimum_temperature() {
        let temp_data = vec![
            TempData {
                temp: 25.0,
                weight: 1.0,
            },
            TempData {
                temp: 20.0,
                weight: 1.0,
            },
            TempData {
                temp: 30.0,
                weight: 1.0,
            },
        ];
        let result = CustomSensorsRepo::process_mix_min(&temp_data);
        assert_eq!(result, 20.0);
    }

    // Returns 0 when all temperatures in the vector are 0.
    #[test]
    #[allow(clippy::float_cmp)]
    fn returns_zero_when_all_temperatures_are_zero() {
        let temp_data = vec![
            TempData {
                temp: 0.0,
                weight: 1.0,
            },
            TempData {
                temp: 0.0,
                weight: 1.0,
            },
            TempData {
                temp: 0.0,
                weight: 1.0,
            },
        ];
        let result = CustomSensorsRepo::process_mix_min(&temp_data);
        assert_eq!(result, 0.0);
    }

    // Returns the only temperature in the vector when there is only one temperature.
    #[test]
    #[allow(clippy::float_cmp)]
    fn returns_single_temperature_when_only_one_temperature() {
        let temp_data = vec![TempData {
            temp: 25.0,
            weight: 1.0,
        }];
        let result = CustomSensorsRepo::process_mix_min(&temp_data);
        assert_eq!(result, 25.0);
    }

    // Returns the minimum temperature when there are multiple temperatures in the vector that are the same.
    #[test]
    #[allow(clippy::float_cmp)]
    fn returns_minimum_temperature_with_multiple_same_temperatures() {
        let temp_data = vec![
            TempData {
                temp: 25.0,
                weight: 1.0,
            },
            TempData {
                temp: 20.0,
                weight: 1.0,
            },
            TempData {
                temp: 20.0,
                weight: 1.0,
            },
        ];
        let result = CustomSensorsRepo::process_mix_min(&temp_data);
        assert_eq!(result, 20.0);
    }

    // Returns the maximum temperature value from a vector of TempData structs with positive values
    #[test]
    #[allow(clippy::float_cmp)]
    fn returns_max_temp_from_positive_values() {
        let temp_data = vec![
            TempData {
                temp: 25.0,
                weight: 1.0,
            },
            TempData {
                temp: 30.0,
                weight: 1.0,
            },
            TempData {
                temp: 28.0,
                weight: 1.0,
            },
        ];
        let result = CustomSensorsRepo::process_mix_max(&temp_data);
        assert_eq!(result, 30.0);
    }

    // Returns 0 when all temperature values in the vector are 0
    #[test]
    #[allow(clippy::float_cmp)]
    fn returns_0_when_all_temps_are_0() {
        let temp_data = vec![
            TempData {
                temp: 0.0,
                weight: 1.0,
            },
            TempData {
                temp: 0.0,
                weight: 1.0,
            },
            TempData {
                temp: 0.0,
                weight: 1.0,
            },
        ];
        let result = CustomSensorsRepo::process_mix_max(&temp_data);
        assert_eq!(result, 0.0);
    }

    // Returns the maximum temperature value when all temperature values in the vector are the same
    #[test]
    #[allow(clippy::float_cmp)]
    fn returns_max_temp_when_all_temps_are_same() {
        let temp_data = vec![
            TempData {
                temp: 25.0,
                weight: 1.0,
            },
            TempData {
                temp: 25.0,
                weight: 1.0,
            },
            TempData {
                temp: 25.0,
                weight: 1.0,
            },
        ];
        let result = CustomSensorsRepo::process_mix_max(&temp_data);
        assert_eq!(result, 25.0);
    }

    // Returns 0 when the vector is empty
    #[test]
    #[allow(clippy::float_cmp)]
    fn returns_0_when_vector_is_empty() {
        let temp_data: Vec<TempData> = vec![];
        let result = CustomSensorsRepo::process_mix_max(&temp_data);
        assert_eq!(result, 0.0);
    }

    // Returns the maximum temperature value when the vector has only one element
    #[test]
    #[allow(clippy::float_cmp)]
    fn returns_max_temp_when_vector_has_one_element() {
        let temp_data = vec![TempData {
            temp: 30.0,
            weight: 1.0,
        }];
        let result = CustomSensorsRepo::process_mix_max(&temp_data);
        assert_eq!(result, 30.0);
    }

    // Returns the maximum temperature value when the vector has two elements with different temperature values
    #[test]
    #[allow(clippy::float_cmp)]
    fn returns_max_temp_when_vector_has_two_elements_with_different_temps() {
        let temp_data = vec![
            TempData {
                temp: 25.0,
                weight: 1.0,
            },
            TempData {
                temp: 30.0,
                weight: 1.0,
            },
        ];
        let result = CustomSensorsRepo::process_mix_max(&temp_data);
        assert_eq!(result, 30.0);
    }

    // Calculates the weighted average of a list of temperature data with weights.
    #[test]
    #[allow(clippy::float_cmp)]
    fn calculates_weighted_average() {
        let temp_data = vec![
            TempData {
                temp: 10.0,
                weight: 2.0,
            },
            TempData {
                temp: 20.0,
                weight: 3.0,
            },
            TempData {
                temp: 30.0,
                weight: 4.0,
            },
        ];
        let result = CustomSensorsRepo::process_mix_weighted_avg(&temp_data);
        assert_eq!(result, 22.222_222_222_222_22);
    }

    // Returns the correct weighted average for a list of temperature data with weights.
    #[test]
    #[allow(clippy::float_cmp)]
    fn returns_correct_weighted_average() {
        let temp_data = vec![
            TempData {
                temp: 5.0,
                weight: 1.0,
            },
            TempData {
                temp: 10.0,
                weight: 2.0,
            },
            TempData {
                temp: 15.0,
                weight: 3.0,
            },
        ];
        let result = CustomSensorsRepo::process_mix_weighted_avg(&temp_data);
        assert_eq!(result, 11.666_666_666_666_666);
    }

    // Returns 0 when given an empty list of temperature data.
    #[test]
    #[allow(clippy::float_cmp)]
    fn returns_zero_for_empty_list() {
        let temp_data = vec![];
        let result = CustomSensorsRepo::process_mix_weighted_avg(&temp_data);
        assert_eq!(result, 0.0);
    }

    // Calculates the average temperature correctly when given a vector of valid temperature data.
    #[test]
    #[allow(clippy::float_cmp)]
    fn calculates_average_temperature_correctly() {
        let temp_data = vec![
            TempData {
                temp: 10.0,
                weight: 1.0,
            },
            TempData {
                temp: 20.0,
                weight: 1.0,
            },
            TempData {
                temp: 30.0,
                weight: 1.0,
            },
        ];
        let result = CustomSensorsRepo::process_mix_avg(&temp_data);
        assert_eq!(result, 20.0);
    }

    // Returns 0 when given an empty vector of temperature data.
    #[test]
    #[allow(clippy::float_cmp)]
    fn returns_zero_for_empty_vector() {
        let temp_data = vec![];
        let result = CustomSensorsRepo::process_mix_avg(&temp_data);
        assert_eq!(result, 0.0);
    }

    // Returns the only temperature value in the vector when given a vector of length 1.
    #[test]
    #[allow(clippy::float_cmp)]
    fn returns_single_value_for_vector_of_length_one() {
        let temp_data = vec![TempData {
            temp: 15.0,
            weight: 1.0,
        }];
        let result = CustomSensorsRepo::process_mix_avg(&temp_data);
        assert_eq!(result, 15.0);
    }

    #[test]
    #[serial]
    #[allow(clippy::float_cmp)]
    fn test_file_temp_status_valid() {
        cc_fs::test_runtime(async {
            // given:
            let test_file = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write(
                &test_file,
                b"30000".to_vec(), // millidegree temp
            )
            .await
            .unwrap();
            let cs_name = "test_sensor1".to_string();
            let sensor = CustomSensor {
                id: cs_name.clone(),
                cs_type: CustomSensorType::File,
                mix_function: CustomSensorMixFunctionType::Min,
                sources: vec![],
                file_path: Some(test_file),
            };

            // when:
            let temp = CustomSensorsRepo::process_custom_sensor_data_file_current(&sensor).await;

            // then:
            assert_eq!(temp.name, cs_name);
            assert_eq!(temp.temp, 30.);
        });
    }

    #[test]
    #[serial]
    #[allow(clippy::float_cmp)]
    fn test_file_temp_status_invalid() {
        cc_fs::test_runtime(async {
            // given:
            let test_file = Path::new("/tmp/does_not_exist").to_path_buf();
            let cs_name = "test_sensor1".to_string();
            let sensor = CustomSensor {
                id: cs_name.clone(),
                cs_type: CustomSensorType::File,
                mix_function: CustomSensorMixFunctionType::Min,
                sources: vec![],
                file_path: Some(test_file),
            };

            // when:
            let temp = CustomSensorsRepo::process_custom_sensor_data_file_current(&sensor).await;

            // then:
            assert_eq!(temp.name, cs_name);
            assert_eq!(temp.temp, 0.);
        });
    }

    #[test]
    #[serial]
    #[allow(clippy::float_cmp)]
    fn test_file_temp_valid() {
        cc_fs::test_runtime(async {
            // given:
            let test_file = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write(
                &test_file,
                b"30000".to_vec(), // millidegree temp
            )
            .await
            .unwrap();
            let sensor = CustomSensor {
                id: String::default(),
                cs_type: CustomSensorType::File,
                mix_function: CustomSensorMixFunctionType::Min,
                sources: vec![],
                file_path: Some(test_file),
            };

            // when:
            let temp_result = CustomSensorsRepo::get_custom_sensor_file_temp(&sensor).await;

            // then:
            assert!(temp_result.is_ok());
            let temp = temp_result.unwrap();
            assert_eq!(temp, 30.);
        });
    }

    #[test]
    #[serial]
    #[allow(clippy::float_cmp)]
    fn test_file_temp_valid_with_return() {
        cc_fs::test_runtime(async {
            // given:
            let test_file = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write(&test_file, b" 30000\n\r".to_vec())
                .await
                .unwrap();
            let sensor = CustomSensor {
                id: String::default(),
                cs_type: CustomSensorType::File,
                mix_function: CustomSensorMixFunctionType::Min,
                sources: vec![],
                file_path: Some(test_file),
            };

            // when:
            let temp_result = CustomSensorsRepo::get_custom_sensor_file_temp(&sensor).await;

            // then:
            assert!(temp_result.is_ok());
            let temp = temp_result.unwrap();
            assert_eq!(temp, 30.);
        });
    }

    #[test]
    #[serial]
    fn test_file_temp_not_exist() {
        cc_fs::test_runtime(async {
            // given:
            let test_file = Path::new("/tmp/does_not_exist").to_path_buf();
            let sensor = CustomSensor {
                id: "test_sensor1".to_string(),
                cs_type: CustomSensorType::File,
                mix_function: CustomSensorMixFunctionType::Min,
                sources: vec![],
                file_path: Some(test_file),
            };

            // when:
            let temp_result = CustomSensorsRepo::get_custom_sensor_file_temp(&sensor).await;

            // then:
            assert!(temp_result.is_err());
            assert!(temp_result
                .map_err(|err| err.to_string().contains("File not found"))
                .unwrap_err());
        });
    }

    #[test]
    #[serial]
    fn test_file_temp_not_present() {
        cc_fs::test_runtime(async {
            // given:
            let sensor = CustomSensor {
                id: "test_sensor1".to_string(),
                cs_type: CustomSensorType::File,
                mix_function: CustomSensorMixFunctionType::Min,
                sources: vec![],
                file_path: None,
            };

            // when:
            let temp_result = CustomSensorsRepo::get_custom_sensor_file_temp(&sensor).await;

            // then:
            assert!(temp_result.is_err());
            assert!(temp_result
                .map_err(|err| err
                    .to_string()
                    .contains("File path not present for custom sensor"))
                .unwrap_err());
        });
    }

    #[test]
    #[serial]
    fn test_file_temp_invalid_out_of_range_1() {
        cc_fs::test_runtime(async {
            // given:
            let test_file = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write(
                &test_file,
                b"-1000".to_vec(), // millidegree temp
            )
            .await
            .unwrap();
            let sensor = CustomSensor {
                id: String::default(),
                cs_type: CustomSensorType::File,
                mix_function: CustomSensorMixFunctionType::Min,
                sources: vec![],
                file_path: Some(test_file),
            };

            // when:
            let temp_result = CustomSensorsRepo::get_custom_sensor_file_temp(&sensor).await;

            // then:
            assert!(temp_result.is_err());
            assert!(temp_result
                .map_err(|err| err
                    .to_string()
                    .contains("File does not contain a reasonable temperature"))
                .unwrap_err());
        });
    }

    #[test]
    #[serial]
    fn test_file_temp_invalid_out_of_range_2() {
        cc_fs::test_runtime(async {
            // given:
            let test_file = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write(
                &test_file,
                b"1000000".to_vec(), // millidegree temp
            )
            .await
            .unwrap();
            let sensor = CustomSensor {
                id: String::default(),
                cs_type: CustomSensorType::File,
                mix_function: CustomSensorMixFunctionType::Min,
                sources: vec![],
                file_path: Some(test_file),
            };

            // when:
            let temp_result = CustomSensorsRepo::get_custom_sensor_file_temp(&sensor).await;

            // then:
            assert!(temp_result.is_err());
            assert!(temp_result
                .map_err(|err| err
                    .to_string()
                    .contains("File does not contain a reasonable temperature"))
                .unwrap_err());
        });
    }

    #[test]
    #[serial]
    fn test_file_temp_invalid_format() {
        cc_fs::test_runtime(async {
            // given:
            let test_file = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write(&test_file, b"asdf".to_vec()).await.unwrap();
            let sensor = CustomSensor {
                id: String::default(),
                cs_type: CustomSensorType::File,
                mix_function: CustomSensorMixFunctionType::Min,
                sources: vec![],
                file_path: Some(test_file),
            };

            // when:
            let temp_result = CustomSensorsRepo::get_custom_sensor_file_temp(&sensor).await;

            // then:
            assert!(temp_result.is_err());
            assert!(temp_result
                .map_err(|err| err.to_string().contains("invalid digit"))
                .unwrap_err());
        });
    }

    #[test]
    #[serial]
    fn test_file_temp_invalid_too_large_for_i32() {
        cc_fs::test_runtime(async {
            // given:
            let test_file = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write_string(&test_file, (i64::from(i32::MAX) + 1).to_string())
                .await
                .unwrap();
            let sensor = CustomSensor {
                id: String::default(),
                cs_type: CustomSensorType::File,
                mix_function: CustomSensorMixFunctionType::Min,
                sources: vec![],
                file_path: Some(test_file.clone()),
            };

            // when:
            let temp_result = CustomSensorsRepo::get_custom_sensor_file_temp(&sensor).await;

            // then:
            assert!(temp_result.is_err());
            assert!(temp_result
                .map_err(|err| err.to_string().contains("number too large"))
                .unwrap_err());
        });
    }

    #[test]
    #[serial]
    fn test_file_temp_invalid_file_size_too_large() {
        cc_fs::test_runtime(async {
            // given:
            let test_file = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write(
                &test_file,
                b"100000000000000000000000000000000000000000000000000000000000000000000000000"
                    .to_vec(),
            )
            .await
            .unwrap();
            let sensor = CustomSensor {
                id: String::default(),
                cs_type: CustomSensorType::File,
                mix_function: CustomSensorMixFunctionType::Min,
                sources: vec![],
                file_path: Some(test_file.clone()),
            };

            // when:
            let temp_result = CustomSensorsRepo::get_custom_sensor_file_temp(&sensor).await;

            // then:
            // println!("{temp_result:?}");
            assert!(temp_result.is_err());
            assert!(temp_result
                .map_err(|err| err.to_string().contains("File size too large"))
                .unwrap_err());
        });
    }

    #[test]
    #[serial]
    fn test_file_temp_invalid_number_format() {
        cc_fs::test_runtime(async {
            // given:
            let test_file = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write(&test_file, b"32.5".to_vec()).await.unwrap();
            let sensor = CustomSensor {
                id: String::default(),
                cs_type: CustomSensorType::File,
                mix_function: CustomSensorMixFunctionType::Min,
                sources: vec![],
                file_path: Some(test_file),
            };

            // when:
            let temp_result = CustomSensorsRepo::get_custom_sensor_file_temp(&sensor).await;

            // then:
            assert!(temp_result.is_err());
            assert!(temp_result
                .map_err(|err| err.to_string().contains("invalid digit"))
                .unwrap_err());
        });
    }

    #[test]
    #[serial]
    fn test_file_temp_invalid_empty() {
        cc_fs::test_runtime(async {
            // given:
            let test_file = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write(&test_file, b"".to_vec()).await.unwrap();
            let sensor = CustomSensor {
                id: String::default(),
                cs_type: CustomSensorType::File,
                mix_function: CustomSensorMixFunctionType::Min,
                sources: vec![],
                file_path: Some(test_file),
            };

            // when:
            let temp_result = CustomSensorsRepo::get_custom_sensor_file_temp(&sensor).await;

            // then:
            assert!(temp_result.is_err());
            assert!(temp_result
                .map_err(|err| err.to_string().contains("empty string"))
                .unwrap_err());
        });
    }

    #[test]
    #[serial]
    fn test_file_temp_invalid_blank() {
        cc_fs::test_runtime(async {
            // given:
            let test_file = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write(&test_file, b" ".to_vec()).await.unwrap();
            let sensor = CustomSensor {
                id: String::default(),
                cs_type: CustomSensorType::File,
                mix_function: CustomSensorMixFunctionType::Min,
                sources: vec![],
                file_path: Some(test_file),
            };

            // when:
            let temp_result = CustomSensorsRepo::get_custom_sensor_file_temp(&sensor).await;

            // then:
            assert!(temp_result.is_err());
            assert!(temp_result
                .map_err(|err| err.to_string().contains("empty string"))
                .unwrap_err());
        });
    }
}
