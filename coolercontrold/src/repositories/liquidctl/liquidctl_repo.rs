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
use std::clone::Clone;
use std::collections::{HashMap, HashSet};
use std::ops::Not;
use std::rc::Rc;
use std::str::FromStr;
use std::string::ToString;
use std::time::Instant;

use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use futures_util::future::join_all;
use heck::ToTitleCase;
use log::{debug, error, info, trace, warn};
use regex::Regex;

use crate::config::Config;
use crate::device::{ChannelName, DeviceType, DeviceUID, LcInfo, Status, TempInfo, TypeIndex, UID};
use crate::repositories::liquidctl::base_driver::BaseDriver;
use crate::repositories::liquidctl::device_mapper::DeviceMapper;
use crate::repositories::liquidctl::liqctld_client::{
    DeviceResponse, LCStatus, LiqctldClient, LIQCTLD_CONNECTION_TRIES,
};
use crate::repositories::liquidctl::supported_devices::device_support;
use crate::repositories::liquidctl::supported_devices::device_support::StatusMap;
use crate::repositories::repository::{DeviceList, DeviceLock, InitError, Repository};
use crate::setting::{LcdSettings, LightingSettings, TempSource};
use crate::Device;

const PATTERN_TEMP_SOURCE_NUMBER: &str = r"(?P<number>\d+)$";

pub struct LiquidctlRepo {
    config: Rc<Config>,
    liqctld_client: LiqctldClient,
    device_mapper: DeviceMapper,
    devices: HashMap<UID, DeviceLock>,
    preloaded_statuses: RefCell<HashMap<u8, LCStatus>>,
    disabled_channels: RefCell<HashMap<UID, Vec<ChannelName>>>,
}

impl LiquidctlRepo {
    pub async fn new(config: Rc<Config>) -> Result<Self> {
        if config
            .get_settings()
            .is_ok_and(|settings| settings.liquidctl_integration.not())
        {
            let _: Result<()> = async {
                // attempt to quickly shut down the liqctld service if it happens to be running.
                let liqctld_client = LiqctldClient::new(1).await?;
                liqctld_client.post_quit().await?;
                liqctld_client.shutdown();
                Ok(())
            }
            .await;
            return Err(InitError::LiqctldDisabled.into());
        }
        info!("Attempting to connect to coolercontrol-liqctld...");
        let liqctld_client = LiqctldClient::new(LIQCTLD_CONNECTION_TRIES)
            .await
            .map_err(|err| InitError::Connection {
                msg: err.to_string(),
            })?;
        liqctld_client
            .handshake()
            .await
            .map_err(|err| InitError::Connection {
                msg: err.to_string(),
            })?;
        info!("Communication established with coolercontrol-liqctld.");
        Ok(LiquidctlRepo {
            config,
            liqctld_client,
            device_mapper: DeviceMapper::new(),
            devices: HashMap::new(),
            preloaded_statuses: RefCell::new(HashMap::new()),
            disabled_channels: RefCell::new(HashMap::new()),
        })
    }

    pub async fn get_devices(&mut self) -> Result<()> {
        let devices_response = self.liqctld_client.get_all_devices().await?;
        let mut unique_device_identifiers = get_unique_identifiers(&devices_response.devices);
        let poll_rate = self.config.get_settings()?.poll_rate;

        for device_response in devices_response.devices {
            let driver_type = match self.map_driver_type(&device_response) {
                None => {
                    info!(
                        "The liquidctl Driver: {:?} is currently not supported. If support is desired, please create a feature request.",
                        device_response.device_type
                    );
                    continue;
                }
                Some(d_type) => d_type,
            };
            self.preloaded_statuses
                .borrow_mut()
                .insert(device_response.id, Vec::new());
            let device_info = self
                .device_mapper
                .extract_info(&driver_type, &device_response);
            let mut device = Device::new(
                device_response.description,
                DeviceType::Liquidctl,
                device_response.id,
                Some(LcInfo {
                    driver_type,
                    firmware_version: None,
                    unknown_asetek: false,
                }),
                device_info,
                unique_device_identifiers.remove(&device_response.id),
                poll_rate,
            );
            let cc_device_setting = self.config.get_cc_settings_for_device(&device.uid)?;
            if cc_device_setting.is_some() && cc_device_setting.as_ref().unwrap().disable {
                info!(
                    "Skipping disabled device: {} with UID: {}",
                    device.name, device.uid
                );
                continue;
            }
            let disabled_channels =
                cc_device_setting.map_or_else(Vec::new, |setting| setting.disable_channels);
            // remove disabled lighting and lcd channels:
            device
                .info
                .channels
                .retain(|channel_name, _| disabled_channels.contains(channel_name).not());
            self.disabled_channels
                .borrow_mut()
                .insert(device.uid.clone(), disabled_channels);
            self.check_for_legacy_690(&mut device).await?;
            self.devices
                .insert(device.uid.clone(), Rc::new(RefCell::new(device)));
        }
        if self.devices.is_empty() {
            info!("No Liqctld supported and enabled devices found. Shutting coolercontrol-liqctld down.");
            self.liqctld_client.post_quit().await?;
            self.liqctld_client.shutdown();
        }
        debug!("List of received Devices: {:?}", self.devices);
        Ok(())
    }

    /// Returns a vector of all driver locations for devices managed by this
    /// `LiquidctlRepo` instance.
    ///
    /// # Parameters
    ///
    /// * `&self`: A reference to the current `LiquidctlRepo` instance.
    ///
    /// # Returns
    ///
    /// A `Vec<String>` containing the driver locations for all devices.
    ///
    /// # Notes
    ///
    /// * The function returns an empty vector if there are no devices or no driver locations.
    pub fn get_all_driver_locations(&self) -> Vec<String> {
        let mut driver_locations = Vec::new();
        for device_lock in self.devices.values() {
            let device = device_lock.borrow();
            for location in &device.info.driver_info.locations {
                driver_locations.push(location.to_owned());
            }
        }
        driver_locations
    }

    #[allow(clippy::cast_possible_truncation)]
    pub fn update_temp_infos(&self) {
        for device_lock in self.devices.values() {
            let status = {
                let device = device_lock.borrow();
                let preloaded_statuses = self.preloaded_statuses.borrow();
                let lc_status = preloaded_statuses.get(&device.type_index);
                let Some(status) = lc_status else {
                    error!(
                        "There is no status preloaded for this device: {}",
                        device.uid
                    );
                    continue;
                };
                self.map_status(
                    &device
                        .lc_info
                        .as_ref()
                        .expect("Should always be present for LC devices")
                        .driver_type,
                    &device.uid,
                    status,
                    device.type_index,
                )
            };
            device_lock.borrow_mut().info.temps = status
                .temps
                .iter()
                .enumerate()
                .map(|(index, temp_status)| {
                    (
                        temp_status.name.clone(),
                        TempInfo {
                            label: temp_status.name.to_title_case(),
                            number: index as u8 + 1,
                        },
                    )
                })
                .collect();
        }
    }

    fn map_driver_type(&self, device: &DeviceResponse) -> Option<BaseDriver> {
        BaseDriver::from_str(device.device_type.as_str())
            .ok()
            .filter(|driver| self.device_mapper.is_device_supported(driver))
    }

    async fn call_status(&self, device_id: &u8) -> Result<LCStatus> {
        let status_response = self.liqctld_client.get_status(device_id).await?;
        Ok(status_response.status)
    }

    fn create_status_map(lc_statuses: &LCStatus) -> StatusMap {
        let mut status_map = HashMap::new();
        for lc_status in lc_statuses {
            status_map.insert(lc_status.0.to_lowercase(), lc_status.1.clone());
        }
        status_map
    }

    fn map_status(
        &self,
        driver_type: &BaseDriver,
        device_uid: &DeviceUID,
        lc_statuses: &LCStatus,
        device_index: u8,
    ) -> Status {
        let status_map = Self::create_status_map(lc_statuses);
        let mut status = self
            .device_mapper
            .extract_status(driver_type, &status_map, device_index);
        // Due to how liquidctl statuses work, we have to remove disabled channels every status update:
        let disabled_channels_lock = self.disabled_channels.borrow();
        let disabled_channels = disabled_channels_lock.get(device_uid).unwrap();
        status
            .channels
            .retain(|channel| disabled_channels.contains(&channel.name).not());
        status
            .temps
            .retain(|channel| disabled_channels.contains(&channel.name).not());
        status
    }

    async fn call_initialize_concurrently(&self) {
        let mut futures = vec![];
        for device in self.devices.values() {
            futures.push(self.call_initialize_per_device(device));
        }
        let results: Vec<Result<()>> = join_all(futures).await;
        for result in results {
            match result {
                Ok(()) => {}
                Err(err) => error!("Error getting initializing device: {err}"),
            }
        }
    }

    async fn call_initialize_per_device(&self, device_lock: &DeviceLock) -> Result<()> {
        let device_index = device_lock.borrow().type_index;
        let status_response = self
            .liqctld_client
            .initialize_device(&device_index, None)
            .await?;
        let mut device = device_lock.borrow_mut();
        let lc_info = device
            .lc_info
            .as_mut()
            .expect("This should always be set for LIQUIDCTL devices");
        lc_info.firmware_version =
            device_support::get_firmware_ver(&Self::create_status_map(&status_response.status));
        Ok(())
    }

    async fn call_reinitialize_concurrently(&self) {
        let mut futures = vec![];
        for device in self.devices.values() {
            futures.push(self.call_reinitialize_per_device(device));
        }
        let results: Vec<Result<()>> = join_all(futures).await;
        for result in results {
            match result {
                Ok(()) => {}
                Err(err) => error!("Error reinitializing device: {err}"),
            }
        }
    }

    async fn call_reinitialize_per_device(&self, device_lock: &DeviceLock) -> Result<()> {
        let device_index = device_lock.borrow().type_index;
        // pump_modes will be set after re-initializing
        let _ = self
            .liqctld_client
            .initialize_device(&device_index, None)
            .await?;
        Ok(())
    }

    async fn check_for_legacy_690(&self, device: &mut Device) -> Result<()> {
        let lc_info = device.lc_info.as_mut().expect("Should be present");
        if lc_info.driver_type == BaseDriver::Modern690Lc {
            if let Some(is_legacy690) = self.config.legacy690_ids()?.get(&device.uid) {
                if *is_legacy690 {
                    let device_response = self
                        .liqctld_client
                        .put_legacy690(&device.type_index)
                        .await?;
                    device.name.clone_from(&device_response.description);
                    lc_info.driver_type = self
                        .map_driver_type(&device_response)
                        .expect("Should be Legacy690Lc");
                    device.info = self
                        .device_mapper
                        .extract_info(&lc_info.driver_type, &device_response);
                }
                // if is_legacy690 is false, then Modern690Lc is correct, nothing to do.
            } else {
                // if there is no setting for this device then we want to signal a request for
                // this info from the user.
                lc_info.unknown_asetek = true;
            }
        }
        Ok(())
    }

    async fn set_fixed_speed(
        &self,
        device_data: &CachedDeviceData,
        channel_name: &str,
        fixed_speed: u8,
    ) -> Result<()> {
        if device_data.driver_type == BaseDriver::HydroPlatinum && channel_name == "pump" {
            // limits from tested Hydro H150i Pro XT
            let pump_mode = if fixed_speed < 56 {
                "quiet".to_string()
            } else if fixed_speed > 75 {
                "extreme".to_string()
            } else {
                "balanced".to_string()
            };
            self.liqctld_client
                .initialize_device(&device_data.type_index, Some(pump_mode))
                .await
                .map(|_| ()) // ignore successful result
                .map_err(|err| {
                    anyhow!(
                        "Setting fixed speed through initialization for LIQUIDCTL Device #{}: {} - {err}",
                        device_data.type_index, device_data.uid
                    )
                })
        } else if device_data.driver_type == BaseDriver::HydroPro && channel_name == "pump" {
            let pump_mode = if fixed_speed < 34 {
                "quiet".to_string()
            } else if fixed_speed > 66 {
                "performance".to_string()
            } else {
                "balanced".to_string()
            };
            self.liqctld_client
                .initialize_device(&device_data.type_index, Some(pump_mode))
                .await
                .map(|_| ()) // ignore successful result
                .map_err(|err| {
                    anyhow!(
                        "Setting fixed speed through initialization for LIQUIDCTL Device #{}: {} - {err}",
                        device_data.type_index, device_data.uid
                    )
                })
        } else {
            self.liqctld_client
                .put_fixed_speed(&device_data.type_index, channel_name, fixed_speed)
                .await
                .map_err(|err| {
                    anyhow!(
                        "Setting fixed speed for LIQUIDCTL Device #{}: {} - {err}",
                        device_data.type_index,
                        device_data.uid
                    )
                })
        }
    }

    async fn set_speed_profile(
        &self,
        device_data: &CachedDeviceData,
        channel_name: &str,
        temp_source: &TempSource,
        profile: &[(f64, u8)],
    ) -> Result<()> {
        let regex_temp_sensor_number = Regex::new(PATTERN_TEMP_SOURCE_NUMBER)?;
        let temperature_sensor = if regex_temp_sensor_number.is_match(&temp_source.temp_name) {
            let temp_sensor_number: u8 = regex_temp_sensor_number
                .captures(&temp_source.temp_name)
                .context("Temp Sensor Number should exist")?
                .name("number")
                .context("Number Group should exist")?
                .as_str()
                .parse()?;
            Some(temp_sensor_number)
        } else {
            None
        };
        self.liqctld_client
            .put_speed_profile(
                &device_data.type_index,
                channel_name,
                profile,
                temperature_sensor,
            )
            .await
            .map_err(|err| {
                anyhow!(
                    "Setting speed profile for LIQUIDCTL Device #{}: {} - {err}",
                    device_data.type_index,
                    device_data.uid
                )
            })
    }

    async fn set_color(
        &self,
        device_data: &CachedDeviceData,
        channel_name: &str,
        lighting_settings: &LightingSettings,
    ) -> Result<()> {
        let mode = &lighting_settings.mode;
        let colors = lighting_settings.colors.clone();
        let mut time_per_color: Option<u8> = None;
        let mut speed: Option<String> = None;
        if let Some(speed_setting) = &lighting_settings.speed {
            if device_data.driver_type == BaseDriver::Legacy690Lc
                || device_data.driver_type == BaseDriver::Hydro690Lc
            {
                time_per_color = Some(speed_setting.parse::<u8>()?); // time is always an integer
            } else if device_data.driver_type == BaseDriver::Modern690Lc {
                // EVGA uses both for different modes
                time_per_color = Some(speed_setting.parse::<u8>()?);
                speed = Some(speed_setting.clone()); // liquidctl will handle convert to int here
            } else {
                speed = Some(speed_setting.clone()); // str normally for most all devices
            }
        }
        let direction = if lighting_settings.backward.unwrap_or(false) {
            Some("backward".to_string())
        } else {
            None
        };
        self.liqctld_client
            .put_color(
                &device_data.type_index,
                channel_name,
                mode,
                colors,
                time_per_color,
                speed,
                direction,
            )
            .await
            .map_err(|err| {
                anyhow!(
                    "Setting Lighting for LIQUIDCTL Device #{}: {} - {err}",
                    device_data.type_index,
                    device_data.uid
                )
            })
    }

    async fn set_screen(
        &self,
        device_data: &CachedDeviceData,
        channel_name: &str,
        lcd_settings: &LcdSettings,
    ) -> Result<()> {
        // We set several settings at once for lcd/screen settings
        if let Some(brightness) = lcd_settings.brightness {
            if let Err(err) = self
                .send_screen_request(
                    &device_data.type_index,
                    &device_data.uid,
                    channel_name,
                    "brightness",
                    Some(brightness.to_string()), // liquidctl handles conversion to int
                )
                .await
            {
                // we don't abort if there are brightness or orientation setting errors
                warn!(
                    "Error setting lcd/screen brightness {brightness} | {err}. \
                    Check coolercontrol-liqctld log for details."
                );
            }
        }
        if let Some(orientation) = lcd_settings.orientation {
            if let Err(err) = self
                .send_screen_request(
                    &device_data.type_index,
                    &device_data.uid,
                    channel_name,
                    "orientation",
                    Some(orientation.to_string()), // liquidctl handles conversion to int
                )
                .await
            {
                // we don't abort if there are brightness or orientation setting errors
                warn!(
                    "Error setting lcd/screen orientation {orientation} | {err}. \
                    Check coolercontrol-liqctld log for details."
                );
            }
        }
        if lcd_settings.mode == "image" {
            if let Some(image_file) = &lcd_settings.image_file_processed {
                let mode = if image_file.contains(".gif") {
                    // tmp image is pre-processed
                    "gif".to_string()
                } else {
                    "static".to_string()
                };
                self.send_screen_request(
                    &device_data.type_index,
                    &device_data.uid,
                    channel_name,
                    &mode,
                    Some(image_file.clone()),
                )
                .await
                .map_err(|err| {
                    anyhow!("Setting lcd/screen 'image/gif'. Check coolercontrol-liqctld log for details. - {err}")
                })?;
            }
        } else if lcd_settings.mode == "liquid" {
            self.send_screen_request(
                &device_data.type_index,
                &device_data.uid,
                channel_name,
                &lcd_settings.mode,
                None,
            )
            .await
            .map_err(|err| {
                anyhow!("Setting lcd/screen 'liquid' mode. Check coolercontrol-liqctld log for details. - {err}")
            })?;
        }
        Ok(())
    }

    async fn send_screen_request(
        &self,
        type_index: &u8,
        uid: &String,
        channel_name: &str,
        mode: &str,
        value: Option<String>,
    ) -> Result<()> {
        self.liqctld_client
            .put_screen(type_index, channel_name, mode, value)
            .await
            .map_err(|err| {
                anyhow!("Setting screen for LIQUIDCTL Device #{type_index}: {uid} - {err}")
            })
    }

    fn cache_device_data(&self, device_uid: &UID) -> Result<CachedDeviceData> {
        let device = self
            .devices
            .get(device_uid)
            .with_context(|| format!("Device UID not found! {device_uid}"))?
            .borrow();
        Ok(CachedDeviceData {
            type_index: device.type_index,
            uid: device.uid.clone(),
            driver_type: device
                .lc_info
                .as_ref()
                .expect("lc_info for LC Device should always be present")
                .driver_type
                .clone(),
        })
    }

    #[allow(dead_code)]
    /// Resets any used device's LCD screen to its default.
    ///
    /// Due to issue quickly mentioned
    /// [here:](https://github.com/liquidctl/liquidctl/issues/631#issuecomment-1826568352)
    /// setting the LCD to the default 'liquid' mode is ill-advised for newer 2023+ Krakens
    async fn reset_lcd_to_default(&self) {
        for device_lock in self.devices.values() {
            if device_lock
                .borrow()
                .lc_info
                .as_ref()
                .expect("Liquidctl devices should always have lc_info")
                .driver_type
                != BaseDriver::KrakenZ3
            {
                continue;
            }
            let device_uid = device_lock.borrow().uid.clone();
            if let Ok(device_settings) = self.config.get_device_settings(&device_uid) {
                if device_settings
                    .iter()
                    .any(|setting| setting.lcd.is_some())
                    .not()
                {
                    continue;
                }
                let lcd_settings = LcdSettings {
                    mode: "liquid".to_string(),
                    brightness: None,
                    orientation: None,
                    image_file_processed: None,
                    carousel: None,
                    colors: Vec::new(),
                    temp_source: None,
                };
                if let Ok(cached_device_data) = self.cache_device_data(&device_uid) {
                    if let Err(err) = self
                        .set_screen(&cached_device_data, "lcd", &lcd_settings)
                        .await
                    {
                        error!("Error setting LCD screen to default upon shutdown: {err}");
                    };
                }
            }
        }
    }

    /// The function initializes the status history of all devices with their current status.
    /// This is to be called on startup only.
    pub fn initialize_all_device_status_histories_with_current_status(&self) -> Result<()> {
        let poll_rate = self.config.get_settings()?.poll_rate;
        for device_lock in self.devices.values() {
            let recent_status = device_lock.borrow().status_current().unwrap();
            device_lock
                .borrow_mut()
                .initialize_status_history_with(recent_status, poll_rate);
        }
        Ok(())
    }
}

#[async_trait(?Send)]
impl Repository for LiquidctlRepo {
    fn device_type(&self) -> DeviceType {
        DeviceType::Liquidctl
    }

    async fn initialize_devices(&mut self) -> Result<()> {
        debug!("Starting Device Initialization");
        let start_initialization = Instant::now();
        self.call_initialize_concurrently().await;
        let mut init_devices = HashMap::new();
        for (uid, device) in &self.devices {
            init_devices.insert(uid.clone(), device.borrow().clone());
        }
        if log::max_level() == log::LevelFilter::Debug {
            info!("Initialized Liquidctl Devices: {init_devices:?}");
        } else {
            let device_map: HashMap<_, _> = init_devices
                .iter()
                .map(|d| {
                    (
                        d.1.name.clone(),
                        HashMap::from([
                            (
                                "driver name",
                                vec![d.1.info.driver_info.name.clone().unwrap_or_default()],
                            ),
                            (
                                "driver version",
                                vec![d.1.info.driver_info.version.clone().unwrap_or_default()],
                            ),
                            ("locations", d.1.info.driver_info.locations.clone()),
                        ]),
                    )
                })
                .collect();
            info!(
                "Initialized Liquidctl Devices: {}",
                serde_json::to_string(&device_map).unwrap_or_default()
            );
        }
        trace!(
            "Time taken to initialize all LIQUIDCTL devices: {:?}",
            start_initialization.elapsed()
        );
        debug!("LIQUIDCTL Repository initialized");
        Ok(())
    }

    async fn devices(&self) -> DeviceList {
        self.devices.values().cloned().collect()
    }

    async fn preload_statuses(self: Rc<Self>) {
        let start_update = Instant::now();
        moro_local::async_scope!(|scope| {
            for device_lock in self.devices.values() {
                let device_id = device_lock.borrow().type_index;
                let self = Rc::clone(&self);
                scope.spawn(async move {
                    match self.call_status(&device_id).await {
                        Ok(status) => {
                            self.preloaded_statuses
                                .borrow_mut()
                                .insert(device_id, status);
                        }
                        // this leaves the previous status in the map as backup for temporary issues
                        Err(err) => {
                            error!("Error getting status from device #{device_id}: {err}");
                        }
                    }
                });
            }
        })
        .await;
        trace!(
            "STATUS PRELOAD Time taken for all LIQUIDCTL devices: {:?}",
            start_update.elapsed()
        );
    }

    async fn update_statuses(&self) -> Result<()> {
        for device_lock in self.devices.values() {
            let status = {
                let device = device_lock.borrow();
                let preloaded_statuses = self.preloaded_statuses.borrow();
                let lc_status = preloaded_statuses.get(&device.type_index);
                if lc_status.is_none() {
                    error!(
                        "There is no status preloaded for this device: {}",
                        device.uid
                    );
                    continue;
                }
                let status = self.map_status(
                    &device
                        .lc_info
                        .as_ref()
                        .expect("Should always be present for LC devices")
                        .driver_type,
                    &device.uid,
                    lc_status.unwrap(),
                    device.type_index,
                );
                trace!("Device: {} status updated: {:?}", device.name, status);
                status
            };
            device_lock.borrow_mut().set_status(status);
        }
        Ok(())
    }

    async fn shutdown(&self) -> Result<()> {
        if self.liqctld_client.is_connected() {
            // Due to issue quickly mentioned here:
            // https://github.com/liquidctl/liquidctl/issues/631#issuecomment-1826568352
            // - setting the LCD to the default 'liquid' mode is ill-advised for newer 2023+ Krakens
            // self.reset_lcd_to_default().await;
            self.liqctld_client.post_quit().await?;
            self.liqctld_client.shutdown();
        }
        info!("LIQUIDCTL Repository Shutdown");
        Ok(())
    }

    /// On LiquidCtl devices, reset basically does nothing with the device itself.
    /// All internal CoolerControl processes for this device channel are reset though.
    async fn apply_setting_reset(&self, _: &UID, _: &str) -> Result<()> {
        Ok(())
    }

    /// liquidctl drivers handle this themselves, so we don't need to do anything.
    async fn apply_setting_manual_control(
        &self,
        _device_uid: &UID,
        _channel_name: &str,
    ) -> Result<()> {
        Ok(())
    }

    async fn apply_setting_speed_fixed(
        &self,
        device_uid: &UID,
        channel_name: &str,
        speed_fixed: u8,
    ) -> Result<()> {
        let cached_device_data = self.cache_device_data(device_uid)?;
        debug!(
            "Applying LiquidCtl device: {} channel: {}; Fixed Speed: {}",
            device_uid, channel_name, speed_fixed
        );
        self.set_fixed_speed(&cached_device_data, channel_name, speed_fixed)
            .await
            .map_err(|err| {
                anyhow!(
                    "Error on {}:{channel_name} for duty {speed_fixed} - {err}",
                    cached_device_data.driver_type
                )
            })
    }

    async fn apply_setting_speed_profile(
        &self,
        device_uid: &UID,
        channel_name: &str,
        temp_source: &TempSource,
        speed_profile: &[(f64, u8)],
    ) -> Result<()> {
        debug!(
            "Applying LiquidCtl device: {} channel: {}; Speed Profile: {:?}",
            device_uid, channel_name, speed_profile
        );
        let cached_device_data = self.cache_device_data(device_uid)?;
        self.set_speed_profile(
            &cached_device_data,
            channel_name,
            temp_source,
            speed_profile,
        )
        .await
    }

    async fn apply_setting_lighting(
        &self,
        device_uid: &UID,
        channel_name: &str,
        lighting: &LightingSettings,
    ) -> Result<()> {
        debug!(
            "Applying LiquidCtl device: {} channel: {}; Lighting: {:?}",
            device_uid, channel_name, lighting
        );
        let cached_device_data = self.cache_device_data(device_uid)?;
        self.set_color(&cached_device_data, channel_name, lighting)
            .await
    }

    async fn apply_setting_lcd(
        &self,
        device_uid: &UID,
        channel_name: &str,
        lcd: &LcdSettings,
    ) -> Result<()> {
        debug!(
            "Applying LiquidCtl device: {} channel: {}; LCD: {:?}",
            device_uid, channel_name, lcd
        );
        let cached_device_data = self.cache_device_data(device_uid)?;
        self.set_screen(&cached_device_data, channel_name, lcd)
            .await
    }

    async fn apply_setting_pwm_mode(&self, _: &UID, _: &str, _: u8) -> Result<()> {
        Err(anyhow!(
            "Applying PWM Modes are not supported for LiquidCtl devices"
        ))
    }

    async fn reinitialize_devices(&self) {
        let no_init = match self.config.get_settings() {
            Ok(settings) => settings.no_init,
            Err(err) => {
                error!("Error reading settings: {err}");
                false
            }
        };
        if !no_init {
            self.call_reinitialize_concurrently().await;
        }
    }
}

#[derive(Debug)]
struct CachedDeviceData {
    type_index: u8,
    uid: UID,
    driver_type: BaseDriver,
}

#[derive(Debug)]
struct DeviceIdMetadata {
    serial_number: String,
    name: String,
    device_index: TypeIndex,
}

/// This function checks for duplicate liquidctl unique identifiers, and if found, goes through
/// a step by step process to find the most useful unique identifier.
///
/// Useful identifiers are those that persist across system device changes, such as device
/// plugin oder, device adding & removal, etc.
fn get_unique_identifiers(devices_response: &[DeviceResponse]) -> HashMap<TypeIndex, String> {
    let mut unique_device_identifiers = HashMap::new();
    let mut unique_identifier_metadata = HashMap::new();
    for device_response in devices_response {
        let serial_number = device_response
            .serial_number
            .clone()
            .unwrap_or(String::new());
        unique_identifier_metadata.insert(
            device_response.id,
            DeviceIdMetadata {
                serial_number,
                name: device_response.description.clone(),
                device_index: device_response.id,
            },
        );
    }

    let non_unique_serials = find_duplicate_serial_numbers(&unique_identifier_metadata);

    let non_unique_names = find_duplicate_names(&non_unique_serials);

    for id_metadata in unique_identifier_metadata.values() {
        let device_index = id_metadata.device_index;
        let unique_identifier = if non_unique_names.contains_key(&device_index) {
            format!("{}{}", id_metadata.name, id_metadata.device_index)
        } else if non_unique_serials.contains_key(&device_index) {
            format!("{}{}", id_metadata.serial_number, id_metadata.name)
        } else {
            id_metadata.serial_number.clone()
        };
        unique_device_identifiers.insert(device_index, unique_identifier);
    }

    unique_device_identifiers
}

fn find_duplicate_serial_numbers(
    unique_identifier_metadata: &HashMap<u8, DeviceIdMetadata>,
) -> HashMap<TypeIndex, &DeviceIdMetadata> {
    let mut serials = HashSet::new();
    let mut serial_map: HashMap<String, &DeviceIdMetadata> = HashMap::new();
    let mut non_unique_serials: HashMap<TypeIndex, &DeviceIdMetadata> = HashMap::new();
    for id_metadata in unique_identifier_metadata.values() {
        if serials.contains(&id_metadata.serial_number) {
            non_unique_serials.insert(id_metadata.device_index, id_metadata);
            if let Some(existing_serial_device_data) = serial_map.get(&id_metadata.serial_number) {
                non_unique_serials.insert(
                    existing_serial_device_data.device_index,
                    existing_serial_device_data.to_owned(),
                );
            }
        } else {
            serials.insert(id_metadata.serial_number.clone());
            serial_map.insert(id_metadata.serial_number.clone(), id_metadata.to_owned());
        }
    }
    non_unique_serials
}

fn find_duplicate_names<'a>(
    non_unique_serials: &HashMap<TypeIndex, &'a DeviceIdMetadata>,
) -> HashMap<TypeIndex, &'a DeviceIdMetadata> {
    let mut names = HashSet::new();
    let mut name_map: HashMap<String, &DeviceIdMetadata> = HashMap::new();
    let mut non_unique_names: HashMap<TypeIndex, &DeviceIdMetadata> = HashMap::new();
    for id_metadata in non_unique_serials.values() {
        if names.contains(&id_metadata.name) {
            non_unique_names.insert(id_metadata.device_index, id_metadata.to_owned());
            if let Some(existing_device_data) = name_map.get(&id_metadata.name) {
                non_unique_names.insert(
                    existing_device_data.device_index,
                    existing_device_data.to_owned(),
                );
            }
        } else {
            names.insert(id_metadata.name.clone());
            name_map.insert(id_metadata.name.clone(), id_metadata.to_owned());
        }
    }
    non_unique_names
}

/// Tests
#[cfg(test)]
mod tests {
    use super::*;
    use crate::repositories::liquidctl::liqctld_client::DeviceProperties;

    const DEV_PROPS: DeviceProperties = DeviceProperties {
        speed_channels: Vec::new(),
        color_channels: Vec::new(),
        supports_cooling: None,
        supports_cooling_profiles: None,
        supports_lighting: None,
        led_count: None,
        lcd_resolution: None,
    };

    #[test]
    fn test_no_devices() {
        let devices_response = vec![];
        let returned_identifiers = get_unique_identifiers(&devices_response);
        assert!(returned_identifiers.is_empty());
    }

    #[test]
    fn test_all_serials_unique() {
        let devices_response = vec![
            DeviceResponse {
                id: 1,
                description: "3".to_string(),
                device_type: "DeviceType".to_string(),
                serial_number: Some("serial1".to_string()),
                properties: DEV_PROPS.clone(),
                liquidctl_version: None,
                hid_address: None,
                hwmon_address: None,
            },
            DeviceResponse {
                id: 2,
                description: "3".to_string(),
                device_type: "DeviceType".to_string(),
                serial_number: Some("serial2".to_string()),
                properties: DEV_PROPS.clone(),
                liquidctl_version: None,
                hid_address: None,
                hwmon_address: None,
            },
        ];
        let returned_identifiers = get_unique_identifiers(&devices_response);
        assert_eq!(returned_identifiers.len(), 2);
        assert_eq!(returned_identifiers.get(&1), Some(&"serial1".to_string()));
        assert_eq!(returned_identifiers.get(&2), Some(&"serial2".to_string()));
    }

    #[test]
    fn test_duplicate_serial_unique_names() {
        let devices_response = vec![
            DeviceResponse {
                id: 1,
                description: "name1".to_string(),
                device_type: "DeviceType".to_string(),
                serial_number: Some("serial".to_string()),
                properties: DEV_PROPS.clone(),
                liquidctl_version: None,
                hid_address: None,
                hwmon_address: None,
            },
            DeviceResponse {
                id: 2,
                description: "name2".to_string(),
                device_type: "DeviceType".to_string(),
                serial_number: Some("serial".to_string()),
                properties: DEV_PROPS.clone(),
                liquidctl_version: None,
                hid_address: None,
                hwmon_address: None,
            },
        ];
        let returned_identifiers = get_unique_identifiers(&devices_response);
        assert_eq!(returned_identifiers.len(), 2);
        assert_eq!(
            returned_identifiers.get(&1),
            Some(&"serialname1".to_string())
        );
        assert_eq!(
            returned_identifiers.get(&2),
            Some(&"serialname2".to_string())
        );
    }

    #[test]
    fn test_duplicate_serial_duplicate_names() {
        let devices_response = vec![
            DeviceResponse {
                id: 1,
                description: "name".to_string(),
                device_type: "DeviceType".to_string(),
                serial_number: Some("serial".to_string()),
                properties: DEV_PROPS.clone(),
                liquidctl_version: None,
                hid_address: None,
                hwmon_address: None,
            },
            DeviceResponse {
                id: 2,
                description: "name".to_string(),
                device_type: "DeviceType".to_string(),
                serial_number: Some("serial".to_string()),
                properties: DEV_PROPS.clone(),
                liquidctl_version: None,
                hid_address: None,
                hwmon_address: None,
            },
        ];
        let returned_identifiers = get_unique_identifiers(&devices_response);
        assert_eq!(returned_identifiers.len(), 2);
        assert_eq!(returned_identifiers.get(&1), Some(&"name1".to_string()));
        assert_eq!(returned_identifiers.get(&2), Some(&"name2".to_string()));
    }

    #[test]
    fn test_mix_of_duplicates() {
        let devices_response = vec![
            DeviceResponse {
                id: 1,
                description: "name1".to_string(),
                device_type: "DeviceType".to_string(),
                serial_number: Some("serial1".to_string()),
                properties: DEV_PROPS.clone(),
                liquidctl_version: None,
                hid_address: None,
                hwmon_address: None,
            },
            DeviceResponse {
                id: 2,
                description: "name".to_string(),
                device_type: "DeviceType".to_string(),
                serial_number: Some("serial".to_string()),
                properties: DEV_PROPS.clone(),
                liquidctl_version: None,
                hid_address: None,
                hwmon_address: None,
            },
            DeviceResponse {
                id: 3,
                description: "othername".to_string(),
                device_type: "DeviceType".to_string(),
                serial_number: Some("serial".to_string()),
                properties: DEV_PROPS.clone(),
                liquidctl_version: None,
                hid_address: None,
                hwmon_address: None,
            },
            DeviceResponse {
                id: 4,
                description: "name".to_string(),
                device_type: "DeviceType".to_string(),
                serial_number: Some("serial".to_string()),
                properties: DEV_PROPS.clone(),
                liquidctl_version: None,
                hid_address: None,
                hwmon_address: None,
            },
        ];
        let returned_identifiers = get_unique_identifiers(&devices_response);
        assert_eq!(returned_identifiers.len(), 4);
        assert_eq!(returned_identifiers.get(&1), Some(&"serial1".to_string()));
        assert_eq!(returned_identifiers.get(&2), Some(&"name2".to_string()));
        assert_eq!(
            returned_identifiers.get(&3),
            Some(&"serialothername".to_string())
        );
        assert_eq!(returned_identifiers.get(&4), Some(&"name4".to_string()));
    }
}
