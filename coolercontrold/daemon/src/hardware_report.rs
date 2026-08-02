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

//! Paste-ready hardware report.
//!
//! Runs standalone so it still works over SSH when the UI will not come up,
//! and reuses `fans::init_fans` and `hardware_support::diagnose_channel` rather
//! than re-deriving anything, so the report and the running daemon can never
//! disagree about a verdict.
//!
//! Nothing here reads a serial number, a UUID, or a hostname. The output is
//! meant to be pasted into a public support channel, so the identifying fields
//! are limited to board and BIOS, which is what actually narrows a diagnosis.

use crate::device::ChannelName;
use crate::hardware_support::{
    self, ChannelExclusion, ChannelVerdict, DetectedChipRef, HiddenHardware, HwmonExclusion,
    ProbeEnvironment, SystemFinding, SystemInfo,
};
use crate::repositories::hwmon::fans;
use crate::repositories::hwmon::hwmon_repo::{HwmonChannelInfo, HwmonChannelType};
use crate::{cc_fs, VERSION};
use std::collections::HashMap;
use std::fmt::Write;
use std::ops::Not;
use std::path::{Path, PathBuf};

const HWMON_CLASS_PATH: &str = "/sys/class/hwmon";

/// Appended when the compact report is trimmed, so the dropped detail is still
/// reachable rather than silently gone.
const TRIM_NOTICE: &str = "\n[trimmed, run `coolercontrold report --full` for the rest]\n";

/// Discord's message limit. The compact report is meant to be pasted whole, so
/// it is trimmed with a pointer to `--full` rather than being allowed to run
/// past this and get truncated by the client.
pub const COMPACT_CHARACTER_BUDGET: usize = 2000;

/// Room held back for the ```` ``` ```` fences the UI wraps the text in when
/// copying. Without a code block the column alignment collapses in Discord and
/// in every markdown editor, and a report trimmed to exactly the limit would
/// then overflow it by the length of the fences themselves.
const CODE_FENCE_RESERVE: usize = "```\n\n```".len();

/// What the compact report may actually occupy.
const COMPACT_TRIM_TARGET: usize = COMPACT_CHARACTER_BUDGET - CODE_FENCE_RESERVE;

const _: () = assert!(COMPACT_TRIM_TARGET < COMPACT_CHARACTER_BUDGET);

/// One hwmon device as the report sees it.
struct ReportDevice {
    path: PathBuf,
    name: String,
    /// Resolved from `device/driver`. `None` for hwmon entries with no such
    /// link, such as USB and HID devices.
    driver: Option<String>,
    fans: Vec<HwmonChannelInfo>,
    /// Set when the running daemon deliberately left this device out. `None`
    /// from the standalone CLI, which has no daemon to ask and therefore says
    /// nothing rather than guessing.
    excluded: Option<HwmonExclusion>,
    /// Channels of this device the daemon dropped individually, by name. Empty
    /// for a device that was dropped whole: its channels were never reached.
    excluded_channels: HashMap<ChannelName, ChannelExclusion>,
}

/// Builds the report. `full` adds the whole hwmon tree with per-channel state.
pub async fn generate(
    full: bool,
    is_root: bool,
    liquidctl: Option<&[LiquidctlSummary]>,
    hidden: Option<&HiddenHardware>,
) -> String {
    let system_info = SystemInfo::read().await;
    let devices = scan_hwmon(hidden).await;
    let detection = run_probe(is_root);
    let mut report = String::with_capacity(if full { 8192 } else { COMPACT_CHARACTER_BUDGET });
    write_header(&mut report, &system_info);
    write_probe_summary(&mut report, detection.as_ref(), is_root, full);
    write_fan_summary(&mut report, &devices, hidden.is_some()).await;
    write_liquidctl_section(&mut report, liquidctl);
    write_findings(&mut report, detection.as_ref(), is_root);
    if full {
        write_full_tree(&mut report, &devices).await;
        return report;
    }
    trim_to_budget(report)
}

/// The probe needs `/dev/port`, so without root it would report a blocked
/// environment that is really just a permissions problem. Returning `None`
/// keeps the report from asserting something it did not observe.
fn run_probe(is_root: bool) -> Option<cc_detect::DetectionResults> {
    if is_root.not() {
        return None;
    }
    // `false`: a report must never load modules as a side effect of being read.
    Some(cc_detect::run_detection(false, None))
}

fn write_header(report: &mut String, system_info: &SystemInfo) {
    let _ = writeln!(report, "CoolerControl {VERSION} hardware report");
    let _ = writeln!(
        report,
        "Board    {} {}",
        blank_as_unknown(&system_info.board_vendor),
        blank_as_unknown(&system_info.board_name)
    );
    let _ = writeln!(
        report,
        "BIOS     {} {}",
        blank_as_unknown(&system_info.bios_vendor),
        blank_as_unknown(&system_info.bios_release)
    );
    let _ = writeln!(
        report,
        "Kernel   {} ({})",
        sysinfo::System::kernel_version().unwrap_or_else(|| "unknown".to_string()),
        sysinfo::System::cpu_arch()
    );
}

fn write_probe_summary(
    report: &mut String,
    detection: Option<&cc_detect::DetectionResults>,
    is_root: bool,
    full: bool,
) {
    if cc_detect::DETECTION_SUPPORTED.not() {
        let _ = writeln!(report, "Probe    not supported on this architecture");
        return;
    }
    let Some(detection) = detection else {
        let _ = writeln!(
            report,
            "Probe    skipped ({})",
            if is_root {
                "detection disabled"
            } else {
                "needs root, re-run with sudo for chip detection"
            }
        );
        return;
    };
    let environment = &detection.environment;
    let _ = writeln!(
        report,
        "Probe    {} chip(s), Secure Boot {}, container {}, /dev/port {}",
        detection.detected_chips.len(),
        on_off(environment.is_secure_boot),
        yes_no(environment.is_container),
        available_or_not(environment.has_dev_port)
    );
    for chip in &detection.detected_chips {
        // Address and device id mirror the startup detection log, so a chip
        // line in a pasted report can be matched against a pasted log.
        let _ = writeln!(
            report,
            "         {} at {} id:{} -> {} ({})",
            chip.name, chip.address, chip.device_id, chip.driver, chip.module_status
        );
        if full {
            let _ = writeln!(report, "           base address {}", chip.base_address);
        }
    }
}

/// Controllable channels are collapsed to a count. Anything we cannot drive is
/// listed individually with its verdict and its raw state, because that is the
/// whole reason someone is pasting this into a support channel.
///
/// The raw state is deliberately limited to channels we cannot drive. Emitting
/// it for every channel is what `--full` is for, and doing so here would push
/// the compact report past the paste budget on an ordinary desktop. Restricted
/// this way it costs nothing on a healthy machine and a couple of lines on a
/// broken one, which removes a round trip for the common support case.
async fn write_fan_summary(report: &mut String, devices: &[ReportDevice], exclusions_known: bool) {
    let _ = writeln!(report, "\nHWMon Fan Channels");
    if exclusions_known.not() {
        // Same honesty as the liquidctl section: only the running daemon knows
        // which devices it chose to drop, so say that rather than let an
        // unmarked list read as "nothing is hidden".
        let _ = writeln!(
            report,
            "  (run from the app to see which devices are hidden and why)"
        );
    }
    let mut any = false;
    for device in devices {
        if device.fans.is_empty() {
            continue;
        }
        any = true;
        let controllable = device
            .fans
            .iter()
            .filter(|fan| verdict_for(device, fan).is_controllable())
            .count();
        let hidden_fans = device
            .fans
            .iter()
            .filter(|fan| device.excluded_channels.contains_key(&fan.name))
            .count();
        let _ = writeln!(
            report,
            "  {} [{}]  {} fan(s), {controllable} controllable{}{}",
            device.name,
            device.driver.as_deref().unwrap_or("no driver link"),
            device.fans.len(),
            hidden_channel_suffix(hidden_fans),
            exclusion_suffix(device)
        );
        for fan in &device.fans {
            let verdict = verdict_for(device, fan);
            let hidden = device.excluded_channels.get(&fan.name).copied();
            // A hidden channel earns a line even when it is perfectly
            // drivable: that it is missing from the app is the whole point.
            if verdict.is_controllable() && hidden.is_none() {
                continue;
            }
            let _ = writeln!(
                report,
                "    {}: {}",
                channel_title(fan),
                channel_notes(device, fan, verdict, hidden).await
            );
        }
    }
    if any.not() {
        let _ = writeln!(report, "  none found");
    }
}

/// One liquidctl device, reduced to what a maintainer needs.
///
/// Built by the caller from the daemon's live device list. Deliberately has no
/// field for a serial number or a device id: this ends up in a pasted report,
/// and liqctld's own payload carries a serial that must not travel with it.
#[derive(Clone)]
pub struct LiquidctlSummary {
    pub name: String,
    /// False when the user has disabled the device. Disabled devices are
    /// deliberately still listed: "the app cannot see my cooler" and "I turned
    /// that cooler off" look identical in a support thread otherwise.
    pub enabled: bool,
    /// The liquidctl driver class.
    pub driver_class: Option<String>,
    /// The liquidctl version in use, not the device firmware.
    pub liquidctl_version: Option<String>,
    pub firmware_version: Option<String>,
    /// True when the device is also exposed through a kernel hwmon driver, in
    /// which case it appears under Fan channels as well.
    pub hwmon_backed: bool,
}

/// Writes the liquidctl section, or explains its absence.
///
/// `None` means the caller could not enumerate them. The standalone CLI cannot:
/// liqctld's only listing call, `GET /devices`, returns its cache when
/// populated but otherwise runs `find_liquidctl_devices()` and
/// `_connect_device()` on everything it finds, so a read-only report cannot
/// call it safely. Its socket is root-only besides. The daemon already holds
/// the device list in memory and passes `Some`.
fn write_liquidctl_section(report: &mut String, devices: Option<&[LiquidctlSummary]>) {
    let _ = writeln!(report, "\nLiquidctl");
    let Some(devices) = devices else {
        let _ = writeln!(
            report,
            "  not enumerated by this report; devices with a kernel driver are \
             listed above"
        );
        return;
    };
    if devices.is_empty() {
        let _ = writeln!(report, "  no devices");
        return;
    }
    for device in devices {
        let _ = writeln!(
            report,
            "  {} [{}]{}{}",
            device.name,
            device.driver_class.as_deref().unwrap_or("unknown driver"),
            if device.hwmon_backed {
                ", hwmon-backed"
            } else {
                ""
            },
            if device.enabled { "" } else { ", disabled" }
        );
        if let Some(firmware) = device.firmware_version.as_deref() {
            let _ = writeln!(report, "    firmware {firmware}");
        }
    }
    if let Some(version) = devices
        .iter()
        .find_map(|device| device.liquidctl_version.as_deref())
    {
        let _ = writeln!(report, "  liquidctl {version}");
    }
}

fn write_findings(
    report: &mut String,
    detection: Option<&cc_detect::DetectionResults>,
    is_root: bool,
) {
    let _ = writeln!(report, "\nSystem findings");
    if cc_detect::DETECTION_SUPPORTED.not() {
        let _ = writeln!(report, "  detection unsupported on this architecture");
        return;
    }
    let Some(detection) = detection else {
        let _ = writeln!(
            report,
            "  not determined ({})",
            if is_root {
                "detection disabled"
            } else {
                "needs root"
            }
        );
        return;
    };
    let findings = derive_findings(detection);
    if findings.is_empty() {
        let _ = writeln!(report, "  none");
        return;
    }
    for finding in &findings {
        let _ = writeln!(report, "  {}", finding_label(finding));
    }
}

fn derive_findings(detection: &cc_detect::DetectionResults) -> Vec<SystemFinding> {
    let bound_drivers = hardware_support::resolve_bound_drivers(Path::new(HWMON_CLASS_PATH));
    let chips = detection
        .detected_chips
        .iter()
        .map(|chip| DetectedChipRef {
            name: &chip.name,
            driver: &chip.driver,
        })
        .collect::<Vec<_>>();
    let environment = ProbeEnvironment {
        is_container: detection.environment.is_container,
        is_secure_boot: detection.environment.is_secure_boot,
        has_dev_port: detection.environment.has_dev_port,
    };
    hardware_support::derive_system_findings(
        cc_detect::DETECTION_SUPPORTED,
        &chips,
        &detection.blacklisted,
        &environment,
        &bound_drivers,
    )
}

async fn write_full_tree(report: &mut String, devices: &[ReportDevice]) {
    let _ = writeln!(report, "\nFull HWMon Tree");
    for device in devices {
        let _ = writeln!(
            report,
            "  {} [{}] at {}{}",
            device.name,
            device.driver.as_deref().unwrap_or("no driver link"),
            device.path.display(),
            exclusion_suffix(device)
        );
        for fan in &device.fans {
            let verdict = verdict_for(device, fan);
            let pwm = read_attribute(&device.path, &format!("pwm{}", fan.number)).await;
            let pwm_enable =
                read_attribute(&device.path, &format!("pwm{}_enable", fan.number)).await;
            let rpm = read_attribute(&device.path, &format!("fan{}_input", fan.number)).await;
            let hidden = device
                .excluded_channels
                .get(&fan.name)
                .map_or_else(String::new, |reason| format!(" {}", reason.label()));
            let _ = writeln!(
                report,
                "    {}: verdict={} pwm={pwm} pwm_enable={pwm_enable} rpm={rpm} \
                 writable={} label={}{hidden}",
                fan.name,
                verdict_label(verdict),
                fan.caps.is_fan_controllable(),
                fan.label.as_deref().unwrap_or("-")
            );
        }
    }
}

/// The raw pwm state behind a verdict. `pwm_enable` in particular is the field
/// that distinguishes a driver-defined mode from a documented one, and it is
/// what a maintainer asks for first.
async fn raw_state(base_path: &Path, number: u8) -> String {
    let pwm = read_attribute(base_path, &format!("pwm{number}")).await;
    let pwm_enable = read_attribute(base_path, &format!("pwm{number}_enable")).await;
    let rpm = read_attribute(base_path, &format!("fan{number}_input")).await;
    format!("pwm={pwm} pwm_enable={pwm_enable} rpm={rpm}")
}

/// Reads one sysfs attribute for the full dump. A missing or unreadable file
/// is reported as absent rather than failing the report.
async fn read_attribute(base_path: &Path, file_name: &str) -> String {
    cc_fs::read_sysfs(base_path.join(file_name))
        .await
        .map_or_else(|_| "-".to_string(), |value| value.trim().to_string())
}

/// The channel name with its driver label when it has one.
///
/// Eight headers all called `fanN` are indistinguishable in a pasted report,
/// and the label is what tells the user which one is the front intake.
fn channel_title(fan: &HwmonChannelInfo) -> String {
    match fan.label.as_deref() {
        Some(label) if label.trim().is_empty().not() => {
            format!("{} \"{}\"", fan.name, label.trim())
        }
        _ => fan.name.clone(),
    }
}

/// Why this channel earned a line: that it is hidden, that it cannot be
/// driven, or both. A hidden channel that is also uncontrollable says both,
/// because fixing the second does not bring it back.
async fn channel_notes(
    device: &ReportDevice,
    fan: &HwmonChannelInfo,
    verdict: ChannelVerdict,
    hidden: Option<ChannelExclusion>,
) -> String {
    let mut notes = Vec::with_capacity(2);
    if let Some(reason) = hidden {
        notes.push(reason.label().to_string());
    }
    if verdict.is_controllable().not() {
        notes.push(format!(
            "{} ({})",
            verdict_label(verdict),
            raw_state(&device.path, fan.number).await
        ));
    }
    notes.join(", ")
}

/// The channels this device lost individually, keyed by name.
fn hidden_channels(
    hidden: Option<&HiddenHardware>,
    canonical: &Path,
) -> HashMap<ChannelName, ChannelExclusion> {
    let Some(hidden) = hidden else {
        return HashMap::new();
    };
    hidden
        .channels
        .iter()
        .filter(|((path, _), _)| path == canonical)
        .map(|((_, channel_name), reason)| (channel_name.clone(), *reason))
        .collect()
}

/// Reports how many of a device's fans the app is not showing. Silent at zero,
/// which is every ordinary machine.
fn hidden_channel_suffix(count: usize) -> String {
    if count == 0 {
        return String::new();
    }
    format!(", {count} hidden")
}

/// The trailing "hidden: ..." note, or nothing for a device the app shows.
///
/// Silent when the daemon kept the device, which is the common case: a marker
/// on every line would bury the few that matter.
fn exclusion_suffix(device: &ReportDevice) -> String {
    device
        .excluded
        .map_or_else(String::new, |reason| format!(", {}", reason.label()))
}

fn verdict_for(device: &ReportDevice, fan: &HwmonChannelInfo) -> ChannelVerdict {
    fans::diagnose_fan_channel(&device.name, fan, false).verdict
}

/// Enumerates hwmon and builds each device's fan channels with the exact same
/// `init_fans` the daemon uses.
async fn scan_hwmon(hidden: Option<&HiddenHardware>) -> Vec<ReportDevice> {
    let mut devices = Vec::new();
    let Ok(entries) = cc_fs::read_dir(Path::new(HWMON_CLASS_PATH)) else {
        return devices;
    };
    let mut paths = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .collect::<Vec<_>>();
    // Numeric, not lexicographic: plain sorting puts hwmon10 before hwmon2,
    // which reads as a mistake in a report a human is scanning.
    paths.sort_by_key(|path| (hwmon_index(path), path.clone()));
    for path in paths {
        let Ok(name) = cc_fs::read_txt(path.join("name")).await else {
            continue;
        };
        let name = name.trim().to_string();
        if name.is_empty() {
            continue;
        }
        let driver = resolve_driver(&path);
        let fans = fans::init_fans(&path, &name)
            .await
            .unwrap_or_default()
            .into_iter()
            .filter(|channel| channel.hwmon_type == HwmonChannelType::Fan)
            .collect();
        // Matched on the canonical path: the entries here are symlinks into
        // the bus tree, while the daemon recorded its own walk of it.
        let canonical = cc_fs::canonicalize(&path).ok();
        let excluded = canonical
            .as_ref()
            .zip(hidden)
            .and_then(|(canonical, hidden)| hidden.devices.get(canonical).copied());
        let excluded_channels = canonical
            .as_ref()
            .map_or_else(HashMap::new, |canonical| hidden_channels(hidden, canonical));
        devices.push(ReportDevice {
            path,
            name,
            driver,
            fans,
            excluded,
            excluded_channels,
        });
    }
    devices
}

/// The trailing number of a `hwmonN` directory. Entries that do not match sort
/// last rather than being dropped, since a report should show what is there.
fn hwmon_index(path: &Path) -> u32 {
    path.file_name()
        .and_then(|name| name.to_str())
        .and_then(|name| name.strip_prefix("hwmon"))
        .and_then(|digits| digits.parse().ok())
        .unwrap_or(u32::MAX)
}

fn resolve_driver(hwmon_path: &Path) -> Option<String> {
    let target = cc_fs::read_link(hwmon_path.join("device").join("driver")).ok()?;
    let driver = target.file_name()?.to_str()?;
    if driver.is_empty() {
        return None;
    }
    Some(driver.to_string())
}

/// Keeps the compact report pasteable. Trimming on a line boundary avoids
/// cutting a verdict in half, and the pointer to `--full` means the dropped
/// detail is still reachable.
fn trim_to_budget(report: String) -> String {
    if report.chars().count() <= COMPACT_TRIM_TARGET {
        return report;
    }
    let keep = COMPACT_TRIM_TARGET.saturating_sub(TRIM_NOTICE.chars().count());
    let mut trimmed = String::with_capacity(COMPACT_TRIM_TARGET);
    for line in report.lines() {
        if trimmed.chars().count() + line.chars().count() + 1 > keep {
            break;
        }
        trimmed.push_str(line);
        trimmed.push('\n');
    }
    trimmed.push_str(TRIM_NOTICE);
    trimmed
}

fn verdict_label(verdict: ChannelVerdict) -> &'static str {
    match verdict {
        ChannelVerdict::Controllable => "controllable",
        ChannelVerdict::FirmwareOverride => "firmware override",
        ChannelVerdict::FamilyMayNeedOutOfTree => "no control, family may need out-of-tree driver",
        ChannelVerdict::NotSupportedByDriver => "the driver in use exposes no control",
        ChannelVerdict::NoPwm => "no pwm control exposed",
        ChannelVerdict::PwmReadOnly => "pwm is read-only",
        ChannelVerdict::IgnoresDuty => "accepts duty writes but does not respond",
        ChannelVerdict::Unverifiable => "no usable tachometer",
    }
}

fn finding_label(finding: &SystemFinding) -> String {
    match finding {
        SystemFinding::NoDriverBound {
            chip_name,
            expected_driver,
        } => format!(
            "{chip_name}: detected, but no loaded driver serves it (expected {expected_driver})"
        ),
        SystemFinding::Blacklisted { driver } => format!("{driver}: blacklisted, not loaded"),
        SystemFinding::BlockedByEnvironment { reason } => {
            format!("Super-I/O probe blocked: {reason:?}")
        }
        SystemFinding::DetectionUnsupported => {
            "Super-I/O detection unsupported on this architecture".to_string()
        }
    }
}

fn blank_as_unknown(value: &str) -> &str {
    if value.is_empty() {
        "unknown"
    } else {
        value
    }
}

fn on_off(value: bool) -> &'static str {
    if value {
        "on"
    } else {
        "off"
    }
}

fn yes_no(value: bool) -> &'static str {
    if value {
        "yes"
    } else {
        "no"
    }
}

fn available_or_not(value: bool) -> &'static str {
    if value {
        "available"
    } else {
        "unavailable"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Goal: the compact report stays pasteable into Discord *after* the UI
    /// wraps it in a code fence. Method: feed the trimmer a report far over the
    /// limit and check that the fenced result still fits, since a report
    /// trimmed to exactly the limit would overflow once fenced.
    #[test]
    fn compact_report_is_trimmed_to_the_paste_budget() {
        let oversized = "a line of hwmon detail\n".repeat(400);
        let trimmed = trim_to_budget(oversized);
        let fenced = format!("```\n{}\n```", trimmed.trim_end());
        assert!(
            fenced.chars().count() <= COMPACT_CHARACTER_BUDGET,
            "fenced report was {} chars",
            fenced.chars().count()
        );
        assert!(trimmed.contains("--full"));
    }

    /// Goal: a report already within budget must be returned untouched, so the
    /// common case carries no trim notice.
    #[test]
    fn short_report_is_left_alone() {
        let report = "CoolerControl hardware report\nBoard    ACME X\n".to_string();
        assert_eq!(trim_to_budget(report.clone()), report);
    }

    /// Goal: every verdict has a human label. A missing arm would otherwise
    /// only surface when a user pastes a report with a blank reason in it.
    #[test]
    fn every_verdict_has_a_label() {
        for verdict in [
            ChannelVerdict::Controllable,
            ChannelVerdict::FirmwareOverride,
            ChannelVerdict::FamilyMayNeedOutOfTree,
            ChannelVerdict::NoPwm,
            ChannelVerdict::PwmReadOnly,
            ChannelVerdict::IgnoresDuty,
            ChannelVerdict::Unverifiable,
        ] {
            assert!(verdict_label(verdict).is_empty().not());
        }
    }

    fn report_device(name: &str, excluded: Option<HwmonExclusion>) -> ReportDevice {
        ReportDevice {
            path: PathBuf::from(format!("/sys/class/hwmon/{name}")),
            name: name.to_string(),
            driver: Some(name.to_string()),
            fans: Vec::new(),
            excluded,
            excluded_channels: HashMap::new(),
        }
    }

    fn fan(name: &str, label: Option<&str>) -> HwmonChannelInfo {
        HwmonChannelInfo {
            name: name.to_string(),
            label: label.map(ToString::to_string),
            ..HwmonChannelInfo::default()
        }
    }

    /// Goal: a report full of `fanN` lines cannot tell the user which header
    /// is which. The driver's label is the only thing that can, so it rides
    /// along whenever the driver publishes one.
    #[test]
    fn channel_titles_carry_the_driver_label() {
        assert_eq!(
            channel_title(&fan("fan1", Some("PSU Fan"))),
            "fan1 \"PSU Fan\""
        );
        assert_eq!(channel_title(&fan("fan1", None)), "fan1");
        // A label of pure whitespace is no label; quoting it would add noise
        // that reads like a missing value.
        assert_eq!(channel_title(&fan("fan2", Some("  "))), "fan2");
    }

    /// Goal: a channel the user disabled must say so on its own line, and the
    /// device line must account for it. Otherwise the counts disagree with the
    /// app and nothing explains the difference.
    #[test]
    fn hidden_channels_are_counted_and_explained() {
        assert_eq!(hidden_channel_suffix(2), ", 2 hidden");
        assert_eq!(hidden_channel_suffix(0), "");
        assert_eq!(
            ChannelExclusion::UserDisabled.label(),
            "hidden: disabled in settings"
        );
        assert_eq!(
            ChannelExclusion::IgnoredBySensorsConf.label(),
            "hidden: ignored by sensors.conf"
        );
    }

    /// Goal: an hwmon device the daemon hid must say so. Without it, a chip
    /// that is deliberately covered by its liquidctl entry reads as a device
    /// the app failed to pick up, which is the opposite of what happened.
    #[test]
    fn hidden_hwmon_devices_say_why() {
        let hidden = report_device("corsairpsu", Some(HwmonExclusion::DuplicateOfLiquidctl));
        assert_eq!(exclusion_suffix(&hidden), ", handled by liquidctl");
    }

    /// Goal: a device another repository serves is still in the app and its
    /// sysfs files are still read, so the report must call it neither hidden
    /// nor unused. amdgpu is dropped by the hwmon name blacklist purely
    /// because the GPU repository owns it, and either word asserts something
    /// the user can see is false.
    #[test]
    fn a_device_served_elsewhere_is_neither_hidden_nor_unused() {
        for reason in [
            HwmonExclusion::ServedByGpuRepository,
            HwmonExclusion::DuplicateOfLiquidctl,
        ] {
            let suffix = exclusion_suffix(&report_device("amdgpu", Some(reason)));
            assert!(suffix.contains("handled by"), "{suffix}");
            assert!(suffix.contains("hidden").not(), "{suffix}");
            assert!(suffix.contains("not used").not(), "{suffix}");
        }
    }

    /// Goal: the marker stays off the devices the app actually shows. One on
    /// every line would bury the few that matter.
    #[test]
    fn shown_hwmon_devices_carry_no_marker() {
        assert_eq!(exclusion_suffix(&report_device("nct6687", None)), "");
    }

    /// Goal: every exclusion reason can explain itself, including the ones a
    /// maintainer sees rarely. A blank suffix in a pasted report is worse than
    /// no suffix, because it looks like a bug in the reporter.
    #[test]
    fn every_exclusion_has_a_label() {
        for reason in [
            HwmonExclusion::DuplicateOfLiquidctl,
            HwmonExclusion::ServedByGpuRepository,
            HwmonExclusion::UserDisabled,
            HwmonExclusion::AllChannelsIgnored,
        ] {
            assert!(reason.label().is_empty().not(), "{reason:?} has no label");
        }
    }

    fn liquidctl(name: &str, enabled: bool) -> LiquidctlSummary {
        LiquidctlSummary {
            name: name.to_string(),
            enabled,
            driver_class: Some("kraken2".to_string()),
            liquidctl_version: Some("1.15.0".to_string()),
            firmware_version: Some("1.2.3".to_string()),
            hwmon_backed: false,
        }
    }

    /// Goal: a disabled device still appears, marked as disabled. Without it,
    /// "CoolerControl cannot see my cooler" and "I turned that cooler off"
    /// produce identical reports, which sends a support thread the wrong way.
    #[test]
    fn disabled_liquidctl_devices_are_listed_and_marked() {
        let mut report = String::new();
        write_liquidctl_section(
            &mut report,
            Some(&[liquidctl("NZXT Kraken", true), liquidctl("Old Pump", false)]),
        );
        assert!(report.contains("NZXT Kraken"), "{report}");
        assert!(report.contains("Old Pump"), "{report}");
        assert!(report.contains("Old Pump [kraken2], disabled"), "{report}");
        // The enabled device must not pick up the marker.
        assert!(report.contains("NZXT Kraken [kraken2]\n"), "{report}");
    }

    /// Goal: when the caller cannot enumerate them at all, say so rather than
    /// implying the machine has none. The standalone CLI is in this case.
    #[test]
    fn absent_liquidctl_list_is_distinguished_from_empty() {
        let mut unknown = String::new();
        write_liquidctl_section(&mut unknown, None);
        assert!(unknown.contains("not enumerated"), "{unknown}");
        let mut empty = String::new();
        write_liquidctl_section(&mut empty, Some(&[]));
        assert!(empty.contains("no devices"), "{empty}");
    }

    /// Goal: a chip line carries the address and device id, matching the
    /// startup detection log, so a pasted report and a pasted log can be lined
    /// up against each other. Base address is detail for `--full` only, to keep
    /// the compact form inside the paste budget.
    #[test]
    fn chip_lines_carry_address_and_device_id() {
        let detection = cc_detect::DetectionResults {
            detected_chips: vec![cc_detect::DetectedChipInfo {
                name: "Nuvoton NCT6687D-R eSIO".to_string(),
                driver: "nct6687".to_string(),
                address: "0x4E".to_string(),
                base_address: "0x0A20".to_string(),
                device_id: "0xD592".to_string(),
                features: vec!["fan".to_string()],
                module_status: "already_loaded".to_string(),
            }],
            blacklisted: Vec::new(),
            environment: cc_detect::EnvironmentInfo {
                is_container: false,
                is_secure_boot: false,
                has_dev_port: true,
            },
        };
        let mut compact = String::new();
        write_probe_summary(&mut compact, Some(&detection), true, false);
        assert!(
            compact.contains("Nuvoton NCT6687D-R eSIO at 0x4E id:0xD592 -> nct6687"),
            "unexpected chip line:\n{compact}"
        );
        assert!(compact.contains("base address").not());

        let mut full = String::new();
        write_probe_summary(&mut full, Some(&detection), true, true);
        assert!(full.contains("base address 0x0A20"), "{full}");
    }

    /// Goal: hwmon devices sort numerically. Lexicographic order puts hwmon10
    /// ahead of hwmon2, which reads as a bug in a report a human is scanning.
    #[test]
    fn hwmon_devices_sort_numerically() {
        let mut paths = [
            PathBuf::from("/sys/class/hwmon/hwmon10"),
            PathBuf::from("/sys/class/hwmon/hwmon2"),
            PathBuf::from("/sys/class/hwmon/hwmon1"),
        ];
        paths.sort_by_key(|path| (hwmon_index(path), path.clone()));
        let order = paths
            .iter()
            .map(|path| hwmon_index(path))
            .collect::<Vec<_>>();
        assert_eq!(order, vec![1, 2, 10]);
    }

    /// Goal: an unexpected directory name must not panic or vanish, it sorts
    /// last so the report still shows it.
    #[test]
    fn unparseable_hwmon_name_sorts_last() {
        assert_eq!(hwmon_index(Path::new("/sys/class/hwmon/oddball")), u32::MAX);
    }

    /// Goal: without root the report must not claim the environment blocked the
    /// probe. `/dev/port` is unreadable for a non-root user regardless of how
    /// the machine is configured, so reporting NoDevPort there would be a claim
    /// we cannot back with an observation.
    #[test]
    fn non_root_does_not_run_or_assert_a_probe() {
        assert!(run_probe(false).is_none());
        let mut report = String::new();
        write_probe_summary(&mut report, None, false, false);
        assert!(report.contains("needs root"));
        let mut findings = String::new();
        write_findings(&mut findings, None, false);
        assert!(findings.contains("not determined"));
        assert!(findings.contains("Secure Boot").not());
    }
}
