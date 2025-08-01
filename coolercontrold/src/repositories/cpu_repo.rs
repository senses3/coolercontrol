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

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::ops::Not;
use std::path::{Path, PathBuf};
use std::rc::Rc;

use crate::cc_fs;
use crate::config::Config;
use crate::device::{
    ChannelInfo, ChannelStatus, Device, DeviceInfo, DeviceType, DriverInfo, DriverType, Mhz,
    Status, TempInfo, TempStatus, Watts, UID,
};
use crate::repositories::hwmon::hwmon_repo::{HwmonChannelInfo, HwmonChannelType, HwmonDriverInfo};
use crate::repositories::hwmon::{devices, power_cap, temps};
use crate::repositories::repository::{DeviceList, DeviceLock, Repository};
use crate::setting::{LcdSettings, LightingSettings, TempSource};
use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use heck::ToTitleCase;
use log::{debug, error, info, log, trace};
use psutil::cpu::CpuPercentCollector;
use regex::Regex;
use tokio::time::Instant;

pub const CPU_TEMP_NAME: &str = "CPU Temp";
pub const CPU_POWER_NAME: &str = "CPU Power";
const SINGLE_CPU_LOAD_NAME: &str = "CPU Load";
const SINGLE_CPU_FREQ_NAME: &str = "CPU Freq";
const INTEL_DEVICE_NAME: &str = "coretemp";
// cpu_device_names have a priority, and we want to return the first match
pub const CPU_DEVICE_NAMES_ORDERED: [&str; 4] = [
    "k10temp",         // standard AMD module
    INTEL_DEVICE_NAME, // standard Intel module
    "zenpower",        // zenpower AMD module
    "cpu_thermal",     // Raspberry Pi module
];
const PATTERN_PACKAGE_ID: &str = r"package id (?P<number>\d+)$";
const CPUINFO_PATH: &str = "/proc/cpuinfo";

// The ID of the actual physical CPU. On most systems, there is only one:
type PhysicalID = u8;
type ProcessorID = u16; // the logical processor ID

/// A CPU Repository for CPU status
pub struct CpuRepo {
    config: Rc<Config>,
    devices: HashMap<UID, (DeviceLock, Rc<HwmonDriverInfo>)>,
    cpu_infos: HashMap<PhysicalID, Vec<ProcessorID>>,
    cpu_model_names: HashMap<PhysicalID, String>,
    cpu_percent_collector: RefCell<CpuPercentCollector>,
    preloaded_statuses: RefCell<HashMap<u8, (Vec<ChannelStatus>, Vec<TempStatus>)>>,
    energy_counters: HashMap<PhysicalID, Cell<f64>>,
    poll_rate: f64,
}

impl CpuRepo {
    pub fn new(config: Rc<Config>) -> Result<Self> {
        Ok(Self {
            config,
            devices: HashMap::new(),
            cpu_infos: HashMap::new(),
            cpu_model_names: HashMap::new(),
            cpu_percent_collector: RefCell::new(CpuPercentCollector::new()?),
            preloaded_statuses: RefCell::new(HashMap::new()),
            energy_counters: HashMap::new(),
            poll_rate: 0.,
        })
    }

    async fn set_cpu_infos(&mut self, cpuinfo_path: &Path) -> Result<()> {
        let cpu_info_data = cc_fs::read_txt(cpuinfo_path).await?;
        let mut physical_id: PhysicalID = 0;
        let mut model_name = "";
        let mut processor_id: ProcessorID = 0;
        let mut processor_present = false;
        let mut physical_id_present = false;
        let mut model_name_present = false;
        for line in cpu_info_data.lines() {
            let mut it = line.split(':');
            let (key, value) = match (it.next(), it.next()) {
                (Some(key), Some(value)) => (key.trim(), value.trim()),
                _ => continue, // will skip empty lines and non-key-value lines
            };

            if key == "processor" {
                processor_id = value.parse()?;
                processor_present = true;
            }
            if key == "model name" {
                model_name = value;
                model_name_present = true;
            }
            if key == "physical id" {
                physical_id = value.parse()?;
                physical_id_present = true;
            }
            if processor_present && physical_id_present && model_name_present {
                // after each processor's entry
                self.cpu_infos
                    .entry(physical_id)
                    .or_default()
                    .push(processor_id);
                self.cpu_model_names
                    .insert(physical_id, model_name.to_string());
                processor_present = false;
                physical_id_present = false;
                model_name_present = false;
            }
        }
        if self.cpu_infos.is_empty() && self.cpu_model_names.is_empty() {
            // Some CPUs, like the Raspberry Pi, don't have a physical id, so we need to fake one,
            // they do have a model name though.
            for line in cpu_info_data.lines() {
                let mut it = line.split(':');
                let (key, value) = match (it.next(), it.next()) {
                    (Some(key), Some(value)) => (key.trim(), value.trim()),
                    _ => continue, // will skip empty lines and non-key-value lines
                };
                if key == "processor" {
                    self.cpu_infos.entry(0).or_default().push(value.parse()?);
                }
                if key == "Model" {
                    self.cpu_model_names.insert(0, value.to_string());
                }
            }
        }
        if self.cpu_infos.is_empty().not() && self.cpu_model_names.is_empty().not() {
            self.sort_processor_lists();
            trace!("CPUInfo: {:?}", self.cpu_infos);
            Ok(())
        } else {
            Err(anyhow!(
                "cpuinfo either not found or missing data on this system!"
            ))
        }
    }

    fn sort_processor_lists(&mut self) {
        for processor_list in self.cpu_infos.values_mut() {
            processor_list.sort_unstable();
        }
    }

    async fn init_cpu_temp(path: &PathBuf) -> Result<Vec<HwmonChannelInfo>> {
        let include_all_devices = "";
        temps::init_temps(path, include_all_devices).await
    }

    /// Returns the proper CPU physical ID.
    fn match_physical_id(
        &self,
        device_name: &str,
        channels: &Vec<HwmonChannelInfo>,
        index: usize,
    ) -> Result<PhysicalID> {
        if device_name == INTEL_DEVICE_NAME {
            self.parse_intel_physical_id(device_name, channels)
        } else {
            self.parse_amd_physical_id(index)
        }
    }

    /// For Intel, this is given by the package ID in the hwmon temp labels.
    fn parse_intel_physical_id(
        &self,
        device_name: &str,
        channels: &Vec<HwmonChannelInfo>,
    ) -> Result<PhysicalID> {
        let regex_package_id = Regex::new(PATTERN_PACKAGE_ID)?;
        for channel in channels {
            if channel.label.is_none() {
                continue; // package ID is in the label
            }
            let channel_label_lower = channel.label.as_ref().unwrap().to_lowercase();
            if regex_package_id.is_match(&channel_label_lower) {
                let package_id: u8 = regex_package_id
                    .captures(&channel_label_lower)
                    .context("Package ID should exist")?
                    .name("number")
                    .context("Number Group should exist")?
                    .as_str()
                    .parse()?;
                if self.cpu_infos.contains_key(&package_id) {
                    // verify there is a match
                    return Ok(package_id);
                }
            }
        }
        // Older Intel CPUs don't always have a Package sensor present, so if
        // we have only one CPU, we simply return the only physicalID present.
        if self.cpu_infos.len() == 1 {
            Ok(*self.cpu_infos.keys().next().unwrap())
        } else {
            Err(anyhow!(
                "Could not find and match package ID to physical ID: {device_name}, {channels:?}"
            ))
        }
    }

    /// For AMD, this is done by comparing hwmon devices to the cpuinfo processor list.
    #[allow(clippy::cast_possible_truncation)]
    fn parse_amd_physical_id(&self, index: usize) -> Result<PhysicalID> {
        // NOTE: not currently used due to an apparent bug in the amd hwmon kernel driver:
        // let cpu_list: Vec<ProcessorID> = devices::get_processor_ids_from_node_cpulist(index).await?;
        // for (physical_id, processor_list) in &self.cpu_infos {
        //     if cpu_list.iter().eq(processor_list.iter()) {
        //         return Ok(physical_id.clone());
        //     }
        // }

        // If we have only one CPU, we simply return the only physicalID present.
        // This helps edge cases where the physicalID for the CPU is not 0 - but 1. (AMD APU)
        // Otherwise, we do a simple assumption that the physical cpu ID == hwmon device index:
        if self.cpu_infos.len() == 1 {
            return Ok(*self.cpu_infos.keys().next().unwrap());
        }
        let physical_id = index as PhysicalID;
        if self.cpu_infos.contains_key(&physical_id) {
            Ok(physical_id)
        } else {
            Err(anyhow!(
                "Could not match hwmon index to cpuinfo physical id"
            ))
        }
    }

    #[allow(clippy::cast_possible_truncation, clippy::cast_precision_loss)]
    fn collect_load(&self, physical_id: PhysicalID, channel_name: &str) -> Option<ChannelStatus> {
        // it's not necessarily guaranteed that the processor_id is the index of this list, but it probably is:
        let percent_per_processor = self
            .cpu_percent_collector
            .borrow_mut()
            .cpu_percent_percpu()
            .unwrap_or_default();
        let mut percents = Vec::new();
        for (processor_id, percent) in percent_per_processor.into_iter().enumerate() {
            let processor_id = processor_id as ProcessorID;
            if self
                .cpu_infos
                .get(&physical_id)
                .expect("physical_id should be present in cpu_infos")
                .contains(&processor_id)
            {
                percents.push(percent);
            }
        }
        let num_percents = percents.len();
        let num_processors = self.cpu_infos.get(&physical_id)?.len();
        if num_percents == num_processors {
            let load = f64::from(percents.iter().sum::<f32>()) / num_processors as f64;
            Some(ChannelStatus {
                name: channel_name.to_string(),
                duty: Some(load),
                ..Default::default()
            })
        } else {
            error!("Non-matching processors: {num_processors} and percents: {num_percents}");
            None
        }
    }

    /// Collects the average frequency per Physical CPU.
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    async fn collect_freq(cpuinfo_path: &Path) -> HashMap<PhysicalID, Mhz> {
        // There a few ways to get this info, but the most reliable is to read the /proc/cpuinfo.
        // cpuinfo not only will return which frequency belongs to which physical CPU,
        // which is important for CoolerControl's full multi-physical-cpu support,
        // but also it's cached and therefore consistently fast across various systems.
        // See: https://github.com/giampaolo/psutil/issues/1851
        // The alternative is to read one of:
        //   /sys/devices/system/cpu/cpu[0-9]*/cpufreq/scaling_cur_freq
        //  /sys/devices/system/cpu/cpufreq/policy[0-9]*/scaling_cur_freq
        // But these have been reported to be significantly slower on some systems, and it's not
        // clear how to associate the frequency with the physical CPU on multi-cpu systems.
        let mut cpu_avgs = HashMap::new();
        let mut cpu_info_freqs: HashMap<PhysicalID, Vec<Mhz>> = HashMap::new();
        let Ok(cpu_info) = cc_fs::read_txt(cpuinfo_path).await else {
            return cpu_avgs;
        };
        let mut cpu_info_physical_id: PhysicalID = 0;
        let mut cpu_info_freq: f64 = 0.;
        let mut physical_id_present = false;
        let mut freq_present = false;
        for line in cpu_info.lines() {
            if line.starts_with("physical id").not() && line.starts_with("cpu MHz").not() {
                continue;
            }
            let mut it = line.split(':');
            let (key, value) = match (it.next(), it.next()) {
                (Some(key), Some(value)) => (key.trim(), value.trim()),
                _ => continue,
            };
            if key == "physical id" {
                let Ok(phy_id) = value.parse() else {
                    return cpu_avgs;
                };
                cpu_info_physical_id = phy_id;
                physical_id_present = true;
            }
            if key == "cpu MHz" {
                let Ok(freq) = value.parse() else {
                    return cpu_avgs;
                };
                cpu_info_freq = freq;
                freq_present = true;
            }
            if physical_id_present && freq_present {
                // after each processor's entry
                cpu_info_freqs
                    .entry(cpu_info_physical_id)
                    .or_default()
                    .push(cpu_info_freq.trunc() as Mhz);
                physical_id_present = false;
                freq_present = false;
            }
        }
        for (physical_id, freqs) in cpu_info_freqs {
            let avg_freq = freqs.iter().sum::<Mhz>() / freqs.len() as Mhz;
            cpu_avgs.insert(physical_id, avg_freq);
        }
        cpu_avgs
    }

    fn get_status_from_freq_output(
        physical_id: PhysicalID,
        channel_name: &str,
        cpu_freqs: &mut HashMap<PhysicalID, Mhz>,
    ) -> Option<ChannelStatus> {
        cpu_freqs
            .remove(&physical_id)
            .map(|avg_freq| ChannelStatus {
                name: channel_name.to_string(),
                freq: Some(avg_freq),
                ..Default::default()
            })
    }

    fn init_cpu_load(&self, physical_id: PhysicalID) -> Result<HwmonChannelInfo> {
        if self
            .collect_load(physical_id, SINGLE_CPU_LOAD_NAME)
            .is_none()
        {
            Err(anyhow!("Error: no load percent found!"))
        } else {
            Ok(HwmonChannelInfo {
                hwmon_type: HwmonChannelType::Load,
                number: physical_id,
                name: SINGLE_CPU_LOAD_NAME.to_string(),
                label: Some(SINGLE_CPU_LOAD_NAME.to_string()),
                ..Default::default()
            })
        }
    }

    fn init_cpu_freq(
        physical_id: PhysicalID,
        cpu_freqs: &mut HashMap<PhysicalID, Mhz>,
    ) -> Result<HwmonChannelInfo> {
        if Self::get_status_from_freq_output(physical_id, SINGLE_CPU_FREQ_NAME, cpu_freqs).is_none()
        {
            Err(anyhow!("Error: no frequency found!"))
        } else {
            Ok(HwmonChannelInfo {
                hwmon_type: HwmonChannelType::Freq,
                number: physical_id,
                name: SINGLE_CPU_FREQ_NAME.to_string(),
                label: Some(SINGLE_CPU_FREQ_NAME.to_string()),
                ..Default::default()
            })
        }
    }

    async fn request_status(
        &self,
        phys_cpu_id: PhysicalID,
        driver: &HwmonDriverInfo,
        cpu_freqs: &mut HashMap<PhysicalID, Mhz>,
        init: bool,
    ) -> (Vec<ChannelStatus>, Vec<TempStatus>) {
        let mut status_channels = Vec::new();
        for channel in &driver.channels {
            match channel.hwmon_type {
                HwmonChannelType::Load => {
                    let Some(load_status) = self.collect_load(phys_cpu_id, &channel.name) else {
                        continue;
                    };
                    status_channels.push(load_status);
                }
                HwmonChannelType::Freq => {
                    let Some(freq_status) =
                        Self::get_status_from_freq_output(phys_cpu_id, &channel.name, cpu_freqs)
                    else {
                        continue;
                    };
                    status_channels.push(freq_status);
                }
                HwmonChannelType::PowerCap => {
                    let joule_count = power_cap::extract_power_joule_counter(channel.number).await;
                    let previous_joule_count = self
                        .energy_counters
                        .get(&phys_cpu_id)
                        .expect("Energy Counters should be initialized")
                        .replace(joule_count);
                    let mut watts = power_cap::calculate_power_watts(
                        joule_count,
                        previous_joule_count,
                        self.poll_rate,
                    );
                    self.use_cached_value_if_zero(&mut watts, init, phys_cpu_id, &channel.name);
                    let power_status = ChannelStatus {
                        name: channel.name.clone(),
                        watts: Some(watts),
                        ..Default::default()
                    };
                    status_channels.push(power_status);
                }
                _ => (),
            }
        }
        let temps = temps::extract_temp_statuses(driver)
            .await
            .iter()
            .map(|temp| TempStatus {
                name: temp.name.clone(),
                temp: temp.temp,
            })
            .collect();
        (status_channels, temps)
    }

    /// CPU power should rarely be 0, but it looks like the energy counter is either not
    /// consistently updated or is regularly reset, and so sometimes it is 0. For that case, we
    /// will reuse the preload-cached value.
    ///
    /// The device initialization request will return 0, but we can't use a cached value in that case.
    fn use_cached_value_if_zero(
        &self,
        watts: &mut Watts,
        init: bool,
        physical_id: PhysicalID,
        channel_name: &str,
    ) {
        if *watts < 0.01 && !init {
            debug!("CPU counter was measured at 0 watts");
            let device_id = physical_id + 1;
            if let Some(preloaded_status) = self.preloaded_statuses.borrow().get(&device_id) {
                *watts = preloaded_status
                    .0
                    .iter()
                    .find_map(|channel_status| {
                        channel_status
                            .watts
                            .filter(|_| channel_status.name == channel_name)
                    })
                    .unwrap_or_default();
            }
        }
    }

    async fn get_potential_cpu_paths() -> Vec<(String, PathBuf)> {
        let mut potential_cpu_paths = Vec::new();
        for path in devices::find_all_hwmon_device_paths() {
            let device_name = devices::get_device_name(&path).await;
            if CPU_DEVICE_NAMES_ORDERED.contains(&device_name.as_str()) {
                potential_cpu_paths.push((device_name, path));
            }
        }
        potential_cpu_paths
    }

    async fn init_hwmon_cpu_devices(
        &mut self,
        potential_cpu_paths: Vec<(String, PathBuf)>,
    ) -> HashMap<PhysicalID, HwmonDriverInfo> {
        let mut hwmon_devices = HashMap::new();
        let num_of_cpus = self.cpu_infos.len();
        let mut num_cpu_devices_left_to_find = num_of_cpus;
        let mut cpu_freqs = Self::collect_freq(CPUINFO_PATH.as_ref()).await;
        if cpu_freqs.is_empty() {
            // should warn for multi-cpus, but info otherwise
            let lvl = if num_of_cpus > 1 {
                log::Level::Warn
            } else {
                log::Level::Info
            };
            log!(lvl, "No CPU frequencies found in cpuinfo");
        }
        'outer: for cpu_device_name in CPU_DEVICE_NAMES_ORDERED {
            for (index, (device_name, path)) in potential_cpu_paths.iter().enumerate() {
                // is sorted
                if device_name != cpu_device_name {
                    continue;
                }
                let mut channels = Vec::new();
                match Self::init_cpu_temp(path).await {
                    Ok(temps) => channels.extend(temps),
                    Err(err) => error!("Error initializing CPU Temps: {err}"),
                }
                // requires temp channels beforehand
                let physical_id = match self.match_physical_id(device_name, &channels, index) {
                    Ok(id) => id,
                    Err(err) => {
                        error!("Error matching CPU physical ID: {err}");
                        continue;
                    }
                };
                let type_index = physical_id + 1;
                // cpu_info is set first, filling in model names:
                let cpu_name = self.cpu_model_names.get(&physical_id).unwrap().clone();
                let device_uid =
                    Device::create_uid_from(&cpu_name, &DeviceType::CPU, type_index, None);
                let cc_device_setting = self
                    .config
                    .get_cc_settings_for_device(&device_uid)
                    .unwrap_or(None);
                if cc_device_setting.is_some() && cc_device_setting.as_ref().unwrap().disable {
                    info!("Skipping disabled device: {cpu_name} with UID: {device_uid}");
                    continue;
                }
                let disabled_channels =
                    cc_device_setting.map_or_else(Vec::new, |setting| setting.disable_channels);
                match self.init_cpu_load(physical_id) {
                    Ok(load) => channels.push(load),
                    Err(err) => {
                        error!("Error matching cpu load percents to processors: {err}");
                    }
                }
                if cpu_freqs.is_empty().not() {
                    match Self::init_cpu_freq(physical_id, &mut cpu_freqs) {
                        Ok(freq) => channels.push(freq),
                        Err(err) => {
                            error!("Error matching cpu frequencies to processors: {err}");
                        }
                    }
                }
                match power_cap::find_power_cap_paths().await {
                    Ok(power_channels) => {
                        if let Some(channel) = power_channels
                            .into_iter()
                            .find(|channel| channel.number == physical_id)
                        {
                            channels.push(channel);
                        }
                    }
                    Err(err) => {
                        debug!("Error finding power cap paths: {err}");
                    }
                }
                let channels = channels
                    .into_iter()
                    .filter(|channel| disabled_channels.contains(&channel.name).not())
                    .collect::<Vec<HwmonChannelInfo>>();
                let pci_device_names = devices::get_device_pci_names(path).await;
                let model = devices::get_device_model_name(path).await.or_else(|| {
                    pci_device_names.and_then(|names| names.subdevice_name.or(names.device_name))
                });
                let u_id = devices::get_device_unique_id(path, device_name).await;
                let hwmon_driver_info = HwmonDriverInfo {
                    name: device_name.clone(),
                    path: path.clone(),
                    model,
                    u_id,
                    channels,
                    block_dev_path: None,
                };
                hwmon_devices.insert(physical_id, hwmon_driver_info);
                if num_cpu_devices_left_to_find > 1 {
                    num_cpu_devices_left_to_find -= 1;
                    continue;
                }
                break 'outer;
            }
        }
        hwmon_devices
    }

    async fn get_driver_locations(base_path: &Path) -> Vec<String> {
        let hwmon_path = base_path.to_str().unwrap_or_default().to_owned();
        let device_path = devices::get_static_device_path_str(base_path);
        let mut locations = vec![hwmon_path, device_path.unwrap_or_default()];
        if let Some(mod_alias) = devices::get_device_mod_alias(base_path).await {
            locations.push(mod_alias);
        }
        locations
    }
}

#[async_trait(?Send)]
impl Repository for CpuRepo {
    fn device_type(&self) -> DeviceType {
        DeviceType::CPU
    }

    #[allow(clippy::too_many_lines)]
    async fn initialize_devices(&mut self) -> Result<()> {
        debug!("Starting Device Initialization");
        let start_initialization = Instant::now();
        self.poll_rate = self.config.get_settings()?.poll_rate;
        self.set_cpu_infos(CPUINFO_PATH.as_ref()).await?;
        let potential_cpu_paths = Self::get_potential_cpu_paths().await;

        let num_of_cpus = self.cpu_infos.len();
        let hwmon_devices = self.init_hwmon_cpu_devices(potential_cpu_paths).await;
        if hwmon_devices.len() != num_of_cpus {
            if hwmon_devices.is_empty().not() {
                return Err(anyhow!(
                    "Missing CPU specific HWMon devices. cpuinfo count: \
                        {num_of_cpus} hwmon devices found: {}",
                    hwmon_devices.len()
                ));
            }
            info!("No CPU specific HWMON devices found.");
        }

        let mut cpu_freqs = Self::collect_freq(CPUINFO_PATH.as_ref()).await;
        for (physical_id, driver) in hwmon_devices {
            for channel in driver.channels.iter().filter(|channel| {
                channel.hwmon_type == HwmonChannelType::PowerCap && channel.number == physical_id
            }) {
                // fill initial joule_count with a real count (Needed before request_status)
                let joule_count = power_cap::extract_power_joule_counter(channel.number).await;
                self.energy_counters
                    .insert(physical_id, Cell::new(joule_count));
            }
            let (channels, temps) = self
                .request_status(physical_id, &driver, &mut cpu_freqs, true)
                .await;
            let type_index = physical_id + 1;
            self.preloaded_statuses
                .borrow_mut()
                .insert(type_index, (channels.clone(), temps.clone()));
            let cpu_name = self.cpu_model_names.get(&physical_id).unwrap().clone();
            let temp_infos = driver
                .channels
                .iter()
                .filter(|channel| channel.hwmon_type == HwmonChannelType::Temp)
                .map(|channel| {
                    let label_base = channel
                        .label
                        .as_ref()
                        .map_or_else(|| channel.name.to_title_case(), |l| l.to_title_case());
                    (
                        channel.name.clone(),
                        TempInfo {
                            label: format!("{CPU_TEMP_NAME} {label_base}"),
                            number: channel.number,
                        },
                    )
                })
                .collect();
            let mut channel_infos = HashMap::new();
            for channel in &driver.channels {
                match channel.hwmon_type {
                    HwmonChannelType::Load
                    | HwmonChannelType::Freq
                    | HwmonChannelType::PowerCap => {
                        channel_infos.insert(
                            channel.name.clone(),
                            ChannelInfo {
                                label: channel.label.clone(),
                                ..Default::default()
                            },
                        );
                    }
                    _ => (),
                }
            }
            let mut device = Device::new(
                cpu_name,
                DeviceType::CPU,
                type_index,
                None,
                DeviceInfo {
                    channels: channel_infos,
                    temps: temp_infos,
                    temp_max: 100,
                    driver_info: DriverInfo {
                        drv_type: DriverType::Kernel,
                        name: devices::get_device_driver_name(&driver.path).await,
                        version: sysinfo::System::kernel_version(),
                        locations: Self::get_driver_locations(&driver.path).await,
                    },
                    ..Default::default()
                },
                None,
                self.poll_rate,
            );
            let status = Status {
                temps,
                channels,
                ..Default::default()
            };
            device.initialize_status_history_with(status, self.poll_rate);
            self.devices.insert(
                device.uid.clone(),
                (Rc::new(RefCell::new(device)), Rc::new(driver)),
            );
        }

        let mut init_devices = HashMap::new();
        for (uid, (device, hwmon_info)) in &self.devices {
            init_devices.insert(uid.clone(), (device.borrow().clone(), hwmon_info.clone()));
        }
        if log::max_level() == log::LevelFilter::Debug {
            info!("Initialized CPU Devices: {init_devices:?}");
        } else {
            let device_map: HashMap<_, _> = init_devices
                .iter()
                .map(|d| {
                    (
                        d.1 .0.name.clone(),
                        HashMap::from([
                            (
                                "driver name",
                                vec![d.1 .0.info.driver_info.name.clone().unwrap_or_default()],
                            ),
                            (
                                "driver version",
                                vec![d.1 .0.info.driver_info.version.clone().unwrap_or_default()],
                            ),
                            ("locations", d.1 .0.info.driver_info.locations.clone()),
                        ]),
                    )
                })
                .collect();
            info!(
                "Initialized CPU Devices: {}",
                serde_json::to_string(&device_map).unwrap_or_default()
            );
        }
        trace!(
            "Time taken to initialize all CPU devices: {:?}",
            start_initialization.elapsed()
        );
        debug!("CPU Repository initialized");
        Ok(())
    }

    async fn devices(&self) -> DeviceList {
        self.devices
            .values()
            .map(|(device, _)| device.clone())
            .collect()
    }

    async fn preload_statuses(self: Rc<Self>) {
        let start_update = Instant::now();
        let mut cpu_freqs = Self::collect_freq(CPUINFO_PATH.as_ref()).await;
        moro_local::async_scope!(|scope| {
            for (device_lock, driver) in self.devices.values() {
                let device_id = device_lock.borrow().type_index;
                let physical_id = device_id - 1;
                let mut cpu_freq = HashMap::new();
                if let Some(freq) = cpu_freqs.remove(&physical_id) {
                    cpu_freq.insert(physical_id, freq);
                }
                let self = Rc::clone(&self);
                scope.spawn(async move {
                    let (channels, temps) = self
                        .request_status(physical_id, driver, &mut cpu_freq, false)
                        .await;
                    self.preloaded_statuses
                        .borrow_mut()
                        .insert(device_id, (channels, temps));
                });
            }
        })
        .await;
        trace!(
            "STATUS PRELOAD Time taken for all CPU devices: {:?}",
            start_update.elapsed()
        );
    }

    async fn update_statuses(&self) -> Result<()> {
        for (device, _) in self.devices.values() {
            let device_id = device.borrow().type_index;
            let preloaded_statuses_map = self.preloaded_statuses.borrow();
            let preloaded_statuses = preloaded_statuses_map.get(&device_id);
            if preloaded_statuses.is_none() {
                error!("There is no status preloaded for this device: {device_id}");
                continue;
            }
            let (channels, temps) = preloaded_statuses.unwrap().clone();
            let status = Status {
                temps,
                channels,
                ..Default::default()
            };
            trace!("CPU device #{device_id} status was updated with: {status:?}");
            device.borrow_mut().set_status(status);
        }
        Ok(())
    }

    async fn shutdown(&self) -> Result<()> {
        info!("CPU Repository shutdown");
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
            "Applying settings is not supported for CPU devices"
        ))
    }

    async fn apply_setting_speed_fixed(
        &self,
        _device_uid: &UID,
        _channel_name: &str,
        _speed_fixed: u8,
    ) -> Result<()> {
        Err(anyhow!(
            "Applying settings is not supported for CPU devices"
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
            "Applying settings is not supported for CPU devices"
        ))
    }

    async fn apply_setting_lighting(
        &self,
        _device_uid: &UID,
        _channel_name: &str,
        _lighting: &LightingSettings,
    ) -> Result<()> {
        Err(anyhow!(
            "Applying settings is not supported for CPU devices"
        ))
    }

    async fn apply_setting_lcd(
        &self,
        _device_uid: &UID,
        _channel_name: &str,
        _lcd: &LcdSettings,
    ) -> Result<()> {
        Err(anyhow!(
            "Applying settings is not supported for CPU devices"
        ))
    }

    async fn apply_setting_pwm_mode(
        &self,
        _device_uid: &UID,
        _channel_name: &str,
        _pwm_mode: u8,
    ) -> Result<()> {
        Err(anyhow!(
            "Applying settings is not supported for CPU devices"
        ))
    }

    async fn reinitialize_devices(&self) {
        error!("Reinitializing Devices is not supported for this Repository");
    }
}

#[cfg(test)]
mod tests {
    use crate::cc_fs;
    use crate::config::Config;
    use crate::repositories::cpu_repo::CpuRepo;
    use serial_test::serial;
    use std::rc::Rc;

    static CPUINFO_AMD_SINGLE_CPU: &[u8] = include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/resources/tests/cpuinfo/amd_single_cpu"
    ));
    static CPUINFO_AMD_DOUBLE_CPU: &[u8] = include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/resources/tests/cpuinfo/amd_double_cpu"
    ));
    static CPUINFO_INTEL_SINGLE_CPU: &[u8] = include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/resources/tests/cpuinfo/intel_single_cpu"
    ));
    static CPUINFO_RASPBERRY_PI_5: &[u8] = include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/resources/tests/cpuinfo/raspberry_pi_5"
    ));

    #[test]
    #[serial]
    fn test_set_cpu_infos_amd_single_cpu() {
        cc_fs::test_runtime(async {
            // given:
            let test_cpuinfo = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write(&test_cpuinfo, CPUINFO_AMD_SINGLE_CPU.to_vec())
                .await
                .unwrap();
            let test_config = Rc::new(Config::init_default_config().unwrap());
            let mut cpu_repo = CpuRepo::new(test_config).unwrap();

            // when:
            let result = cpu_repo.set_cpu_infos(&test_cpuinfo).await;

            // then:
            assert!(result.is_ok(), "set_cpu_infos should return Ok: {result:?}");
            assert_eq!(
                cpu_repo.cpu_infos.len(),
                1,
                "cpu_infos should have 1 physical cpu entry"
            );
            assert_eq!(
                cpu_repo.cpu_model_names.len(),
                1,
                "cpu_model_names should have 1 entry"
            );
            assert_eq!(
                cpu_repo.cpu_model_names.get(&0).unwrap(),
                "AMD Ryzen 7 5800X 8-Core Processor",
                "cpu_model_names should have the correct model name"
            );
        });
    }

    #[test]
    #[serial]
    fn test_collect_freq_amd_single_cpu() {
        cc_fs::test_runtime(async {
            // given:
            let test_cpuinfo = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write(&test_cpuinfo, CPUINFO_AMD_SINGLE_CPU.to_vec())
                .await
                .unwrap();

            // when:
            let result = CpuRepo::collect_freq(&test_cpuinfo).await;

            // then:
            assert_eq!(
                result.len(),
                1,
                "collect_freq should have 1 physical cpu entry"
            );
            assert_eq!(
                result.get(&0),
                Some(&3005),
                "collect_freq should have the correct average frequency"
            );
        });
    }

    #[test]
    #[serial]
    fn test_set_cpu_infos_amd_double_cpu() {
        cc_fs::test_runtime(async {
            // given:
            let test_cpuinfo = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write(&test_cpuinfo, CPUINFO_AMD_DOUBLE_CPU.to_vec())
                .await
                .unwrap();
            let test_config = Rc::new(Config::init_default_config().unwrap());
            let mut cpu_repo = CpuRepo::new(test_config).unwrap();

            // when:
            let result = cpu_repo.set_cpu_infos(&test_cpuinfo).await;

            // then:
            assert!(result.is_ok(), "set_cpu_infos should return Ok: {result:?}");
            assert_eq!(
                cpu_repo.cpu_infos.len(),
                2,
                "cpu_infos should have 2 physical cpu entries"
            );
            assert_eq!(
                cpu_repo.cpu_model_names.len(),
                2,
                "cpu_model_names should have 2 entries"
            );
            assert_eq!(
                cpu_repo.cpu_model_names.get(&0).unwrap(),
                "AMD Ryzen 7 5800X 8-Core Processor#1",
            );
            assert_eq!(
                cpu_repo.cpu_model_names.get(&1).unwrap(),
                "AMD Ryzen 7 5800X 8-Core Processor#2",
            );
        });
    }

    #[test]
    #[serial]
    fn test_collect_freq_amd_double_cpu() {
        cc_fs::test_runtime(async {
            // given:
            let test_cpuinfo = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write(&test_cpuinfo, CPUINFO_AMD_DOUBLE_CPU.to_vec())
                .await
                .unwrap();

            // when:
            let result = CpuRepo::collect_freq(&test_cpuinfo).await;

            // then:
            assert_eq!(
                result.len(),
                2,
                "collect_freq should have 2 physical cpu entries"
            );
            assert_eq!(
                result.get(&0),
                Some(&3005),
                "collect_freq should have the correct average frequency"
            );
            assert_eq!(
                result.get(&1),
                Some(&818),
                "collect_freq should have the correct average frequency"
            );
        });
    }

    #[test]
    #[serial]
    fn test_set_cpu_infos_intel_single_cpu() {
        cc_fs::test_runtime(async {
            // given:
            let test_cpuinfo = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write(&test_cpuinfo, CPUINFO_INTEL_SINGLE_CPU.to_vec())
                .await
                .unwrap();
            let test_config = Rc::new(Config::init_default_config().unwrap());
            let mut cpu_repo = CpuRepo::new(test_config).unwrap();

            // when:
            let result = cpu_repo.set_cpu_infos(&test_cpuinfo).await;

            // then:
            assert!(result.is_ok(), "set_cpu_infos should return Ok: {result:?}");
            assert_eq!(
                cpu_repo.cpu_infos.len(),
                1,
                "cpu_infos should have 1 physical cpu entries"
            );
            assert_eq!(
                cpu_repo.cpu_model_names.len(),
                1,
                "cpu_model_names should have 1 entries"
            );
            assert_eq!(
                cpu_repo.cpu_model_names.get(&0).unwrap(),
                "Intel(R) Core(TM) i5-8265U CPU @ 1.60GHz",
            );
        });
    }

    #[test]
    #[serial]
    fn test_collect_freq_intel_single_cpu() {
        cc_fs::test_runtime(async {
            // given:
            let test_cpuinfo = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write(&test_cpuinfo, CPUINFO_INTEL_SINGLE_CPU.to_vec())
                .await
                .unwrap();

            // when:
            let result = CpuRepo::collect_freq(&test_cpuinfo).await;

            // then:
            assert_eq!(
                result.len(),
                1,
                "collect_freq should have 1 physical cpu entries"
            );
            assert_eq!(
                result.get(&0),
                Some(&799),
                "collect_freq should have the correct average frequency"
            );
        });
    }

    #[test]
    #[serial]
    fn test_set_cpu_infos_raspberry_pi_5() {
        cc_fs::test_runtime(async {
            // given:
            let test_cpuinfo = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write(&test_cpuinfo, CPUINFO_RASPBERRY_PI_5.to_vec())
                .await
                .unwrap();
            let test_config = Rc::new(Config::init_default_config().unwrap());
            let mut cpu_repo = CpuRepo::new(test_config).unwrap();

            // when:
            let result = cpu_repo.set_cpu_infos(&test_cpuinfo).await;

            // then:
            assert!(result.is_ok(), "set_cpu_infos should return Ok: {result:?}");
            assert_eq!(
                cpu_repo.cpu_infos.len(),
                1,
                "cpu_infos should have 1 physical cpu entries"
            );
            assert_eq!(
                cpu_repo.cpu_model_names.len(),
                1,
                "cpu_model_names should have 1 entries"
            );
            assert_eq!(
                cpu_repo.cpu_model_names.get(&0).unwrap(),
                "Raspberry Pi Compute Module 5 Rev 1.0",
            );
        });
    }

    #[test]
    #[serial]
    fn test_collect_freq_raspberry_pi_5() {
        cc_fs::test_runtime(async {
            // given:
            let test_cpuinfo = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write(&test_cpuinfo, CPUINFO_RASPBERRY_PI_5.to_vec())
                .await
                .unwrap();

            // when:
            let result = CpuRepo::collect_freq(&test_cpuinfo).await;

            // then:
            assert_eq!(
                result.len(),
                0,
                "collect_freq should have no physical cpu entries"
            );
        });
    }

    #[test]
    #[serial]
    fn test_set_cpu_infos_empty() {
        cc_fs::test_runtime(async {
            // given:
            let test_cpuinfo = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write(&test_cpuinfo, vec![]).await.unwrap();
            let test_config = Rc::new(Config::init_default_config().unwrap());
            let mut cpu_repo = CpuRepo::new(test_config).unwrap();

            // when:
            let result = cpu_repo.set_cpu_infos(&test_cpuinfo).await;

            // then:
            assert!(
                result.is_err(),
                "set_cpu_infos should return Err when not found: {result:?}"
            );
        });
    }

    #[test]
    #[serial]
    fn test_collect_freq_empty() {
        cc_fs::test_runtime(async {
            // given:
            let test_cpuinfo = tempfile::NamedTempFile::new().unwrap().path().to_path_buf();
            cc_fs::write(&test_cpuinfo, vec![]).await.unwrap();

            // when:
            let result = CpuRepo::collect_freq(&test_cpuinfo).await;

            // then:
            assert_eq!(result.len(), 0);
        });
    }
}
