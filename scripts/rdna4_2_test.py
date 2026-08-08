#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Guy Boldon and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""
Diagnostic harness for AMD RDNA3/RDNA4 PMFW fan control (gpu_od/fan_ctrl).

Written to answer three questions on cards where CoolerControl fails to apply fan settings:

  1. Are the zero-RPM endpoints really supported, or does the driver merely create the files?
     On SMU 14.0.2 (RDNA4) the sysfs attributes are created whenever a fan curve is supported,
     but reads emit nothing and writes return -ENOTSUPP (524) when the vBIOS pptable does not
     advertise the feature.

  2. What exactly makes a fan_curve commit fail with EIO (os error 5)?
     EIO means PMFW rejected the uploaded OverDrive table. The amdgpu driver logs the reason by
     name, e.g. "Invalid overdrive table content: OD_FAN_CURVE_TEMP_ERROR (13)". That kernel
     line is the decisive evidence, so every operation here captures its own dmesg delta.

  3. Which fan curve shapes does the firmware accept?
     Phase 2 walks a matrix of shapes (flat with duplicate temps, flat with ascending temps,
     descending duties, out-of-range values, partial writes) and records each outcome.

  4. Does the fan actually follow the curve?
     Phase 4 applies a flat curve at the duty floor and then a higher one, watching pwm1 and
     fan1_input. A fan that reaches 0 RPM shows zero-RPM behaviour is active in firmware even
     when the OD control is absent; a fan that settles well above the requested duty shows the
     firmware enforcing its own floor.

Run with sudo. Safe phases run by default; the zero-RPM phase requires --destructive.
"""
import argparse
import errno as errno_mod
import glob
import json
import logging
import os
import re
import subprocess  # nosec B404
import sys
from dataclasses import dataclass, field
from pathlib import Path
from time import sleep, time

__VERSION__ = "0.3.0"

LOG_FILE = "rdna4_2_test.log"
JSON_FILE = "rdna4_2_test.json"

log_format = "%(asctime)-15s %(levelname)-8s %(message)s"
logging.basicConfig(
    level=logging.INFO,
    format=log_format,
    handlers=[logging.FileHandler(LOG_FILE), logging.StreamHandler()],
)
log = logging.getLogger("CoolerControl-RDNA4-2")

# Errno names the kernel can return here. Python's errno module does not know the
# kernel-internal ones (ENOTSUPP), and those are the interesting cases.
ERRNO_NAMES = {
    5: "EIO",
    6: "ENXIO",
    13: "EACCES",
    22: "EINVAL",
    38: "ENOSYS",
    95: "EOPNOTSUPP",
    524: "ENOTSUPP (kernel-internal, feature not supported by this ASIC/firmware)",
}

# Lines worth pulling out of the kernel log delta.
DMESG_HIGHLIGHTS = (
    "Invalid overdrive table content",
    "Failed to upload overdrive table",
    "not supported",
    "must be within",
    "Failed to",
)

PATTERN_FAN_CURVE_POINT = re.compile(
    r"(?P<index>\d+):\s+(?P<temp>\d+)C\s+(?P<duty>\d+)%"
)
PATTERN_FAN_CURVE_LIMITS_TEMP = re.compile(
    r"FAN_CURVE\(hotspot temp\):\s+(?P<temp_min>\d+)C\s+(?P<temp_max>\d+)C"
)
PATTERN_FAN_CURVE_LIMITS_DUTY = re.compile(
    r"FAN_CURVE\(fan speed\):\s+(?P<duty_min>\d+)%\s+(?P<duty_max>\d+)%"
)

FAN_CTRL_FILES = (
    "fan_curve",
    "fan_zero_rpm_enable",
    "fan_zero_rpm_stop_temperature",
    "fan_minimum_pwm",
    "fan_target_temperature",
    "acoustic_limit_rpm_threshold",
    "acoustic_target_rpm_threshold",
)


def errno_name(code):
    if code is None:
        return ""
    if code in ERRNO_NAMES:
        return ERRNO_NAMES[code]
    return errno_mod.errorcode.get(code, f"unknown({code})")


def line_filler():
    log.info("#" * 100)


def thin_filler():
    log.info("-" * 100)


@dataclass
class Operation:
    """One sysfs access, with everything needed to explain why it behaved as it did."""

    phase: str
    label: str
    path: str
    wrote: str = ""
    ok: bool = True
    errno: int = None
    error: str = ""
    kernel_log: list = field(default_factory=list)

    @property
    def errno_name(self):
        return errno_name(self.errno)

    def as_dict(self):
        return {
            "phase": self.phase,
            "label": self.label,
            "path": self.path,
            "wrote": self.wrote,
            "ok": self.ok,
            "errno": self.errno,
            "errno_name": self.errno_name,
            "error": self.error,
            "kernel_log": self.kernel_log,
        }

    def log_result(self):
        if self.ok:
            log.info(f"  OK    {self.label}: wrote {self.wrote!r} -> {self.path}")
        else:
            log.error(
                f"  FAIL  {self.label}: wrote {self.wrote!r} -> {self.path}\n"
                f"        errno {self.errno} ({self.errno_name}): {self.error}"
            )
        for entry in self.kernel_log:
            log.info(f"        kernel: {entry}")


class KernelLog:
    """Reads only the kernel messages produced since the last checkpoint.

    /dev/kmsg supports seeking to the end, so each operation can be bracketed without
    re-reading the whole ring buffer or shelling out to dmesg.
    """

    def __init__(self):
        self.fd = None
        try:
            self.fd = os.open("/dev/kmsg", os.O_RDONLY | os.O_NONBLOCK)
            os.lseek(self.fd, 0, os.SEEK_END)
        except OSError as e:
            log.warning(f"Could not open /dev/kmsg, kernel messages unavailable: {e}")

    def checkpoint(self):
        """Drop anything pending so the next drain() only sees new messages."""
        self.drain()

    def drain(self):
        if self.fd is None:
            return []
        lines = []
        while True:
            try:
                raw = os.read(self.fd, 8192)
            except BlockingIOError:
                break
            except OSError as e:
                # EPIPE means the ring buffer overtook us; the fd stays usable.
                if e.errno == errno_mod.EPIPE:
                    continue
                break
            if not raw:
                break
            for record in raw.decode("utf-8", "replace").splitlines():
                # Format: "<prio>,<seq>,<usec>,<flags>;<message>"
                _, _, message = record.partition(";")
                message = message.split("\n")[0].strip()
                if message:
                    lines.append(message)
        return lines

    def drain_relevant(self):
        """New kernel messages that relate to amdgpu or name an OD failure."""
        relevant = []
        for entry in self.drain():
            lowered = entry.lower()
            if "amdgpu" in lowered or "amd" in lowered:
                relevant.append(entry)
                continue
            if any(marker in entry for marker in DMESG_HIGHLIGHTS):
                relevant.append(entry)
        return relevant

    def close(self):
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None


class Sysfs:
    """Every read and write to the GPU goes through here so nothing escapes the record."""

    def __init__(self, kernel_log, dry_run):
        self.kernel_log = kernel_log
        self.dry_run = dry_run
        self.operations = []
        self.phase = "init"

    def read(self, path):
        """Returns the file contents, or None if the read itself failed."""
        try:
            return Path(path).read_text()
        except OSError as e:
            log.debug(
                f"Read failed for {path}: errno {e.errno} ({errno_name(e.errno)})"
            )
            return None

    def write(self, path, value, label):
        """Writes value to path, recording errno and the kernel messages it produced."""
        op = Operation(phase=self.phase, label=label, path=str(path), wrote=value)
        if self.dry_run:
            op.error = "dry-run, not written"
            log.info(f"  DRY   {label}: would write {value!r} -> {path}")
            self.operations.append(op)
            return op
        self.kernel_log.checkpoint()
        try:
            with open(path, "w") as f:
                f.write(value)
        except OSError as e:
            op.ok = False
            op.errno = e.errno
            op.error = e.strerror or str(e)
        # The SMU round-trip is not instant; give the driver a moment to log.
        sleep(0.2)
        op.kernel_log = self.kernel_log.drain_relevant()
        op.log_result()
        self.operations.append(op)
        return op


class FanCtrl:
    """The gpu_od/fan_ctrl interface for one AMD GPU."""

    def __init__(self, sysfs, device_path, hwmon_path):
        self.sysfs = sysfs
        self.device_path = device_path
        self.hwmon_path = hwmon_path
        self.fan_ctrl_path = device_path / "gpu_od" / "fan_ctrl"
        self.fan_curve_path = self.fan_ctrl_path / "fan_curve"
        self.zero_rpm_path = self.fan_ctrl_path / "fan_zero_rpm_enable"
        self.zero_rpm_stop_temp_path = (
            self.fan_ctrl_path / "fan_zero_rpm_stop_temperature"
        )
        self.temp_min = 0
        self.temp_max = 0
        self.duty_min = 0
        self.duty_max = 0
        self.point_count = 0
        self.baseline_points = []
        self.snapshots = []

    # ---------------------------------------------------------------- reading

    def read_fan_curve(self):
        return self.sysfs.read(self.fan_curve_path)

    def parse_points(self, content):
        points = []
        if not content:
            return points
        for line in content.splitlines():
            match = PATTERN_FAN_CURVE_POINT.search(line)
            if match is not None:
                points.append((int(match.group("temp")), int(match.group("duty"))))
        return points

    def parse_limits(self, content):
        """Fills in the OD_RANGE limits. Returns False when they are absent."""
        found_temp = found_duty = False
        for line in (content or "").splitlines():
            temp_match = PATTERN_FAN_CURVE_LIMITS_TEMP.match(line.strip())
            if temp_match is not None:
                self.temp_min = int(temp_match.group("temp_min"))
                self.temp_max = int(temp_match.group("temp_max"))
                found_temp = True
                continue
            duty_match = PATTERN_FAN_CURVE_LIMITS_DUTY.match(line.strip())
            if duty_match is not None:
                self.duty_min = int(duty_match.group("duty_min"))
                self.duty_max = int(duty_match.group("duty_max"))
                found_duty = True
        return found_temp and found_duty

    def snapshot(self):
        """Current fan state, recorded after every operation to expose drift."""
        curve = self.read_fan_curve()
        return {
            "points": self.parse_points(curve),
            "zero_rpm_enable": self.sysfs.read(self.zero_rpm_path),
            "pwm1": self.sysfs.read(self.hwmon_path / "pwm1"),
            "fan1_input": self.sysfs.read(self.hwmon_path / "fan1_input"),
        }

    def log_snapshot(self, note):
        """Logs the current state and keeps it, so the JSON carries it too."""
        snap = self.snapshot()
        pwm = (snap["pwm1"] or "n/a").strip()
        rpm = (snap["fan1_input"] or "n/a").strip()
        log.info(f"  state {note}: points={snap['points']} pwm1={pwm} rpm={rpm}")
        self.snapshots.append({"phase": self.sysfs.phase, "note": note, **snap})
        return snap

    def read_temps(self):
        """Labelled hwmon temperatures. The curve tracks hotspot/junction."""
        temps = {}
        for temp_file in sorted(self.hwmon_path.glob("temp*_input")):
            raw = self.sysfs.read(temp_file)
            if raw is None:
                continue
            label_file = temp_file.with_name(temp_file.name.replace("_input", "_label"))
            label = self.sysfs.read(label_file)
            name = label.strip() if label else temp_file.name
            try:
                temps[name] = int(raw.strip()) / 1000.0
            except ValueError:
                continue
        return temps

    def read_fan(self):
        """(pwm 0-255, rpm) as integers, or None where unreadable."""
        pwm = self.sysfs.read(self.hwmon_path / "pwm1")
        rpm = self.sysfs.read(self.hwmon_path / "fan1_input")

        def as_int(raw):
            try:
                return int(raw.strip())
            except (AttributeError, ValueError):
                return None

        return as_int(pwm), as_int(rpm)

    # ---------------------------------------------------------------- writing

    def write_points(self, points, label, stop_on_error=False):
        """Writes each curve point. Returns the operations performed.

        Unlike the daemon, this does not abort on the first failure by default: knowing
        whether later points still write is part of what we are measuring.
        """
        ops = []
        for index, (temp, duty) in enumerate(points):
            op = self.sysfs.write(
                self.fan_curve_path, f"{index} {temp} {duty}\n", f"{label}[{index}]"
            )
            ops.append(op)
            if stop_on_error and not op.ok:
                break
        return ops

    def commit(self, label):
        return self.sysfs.write(self.fan_curve_path, "c\n", f"{label} commit")

    def reset_curve(self, label):
        return self.sysfs.write(self.fan_curve_path, "r\n", f"{label} reset")

    def apply(self, points, label, stop_on_error=False):
        """Writes points then commits. Returns (point_ops, commit_op)."""
        log.info(f"  applying {label}: {points}")
        point_ops = self.write_points(points, label, stop_on_error)
        commit_op = self.commit(label)
        return point_ops, commit_op

    # ---------------------------------------------------------------- shapes

    def shape_ascending(self):
        """A valid strictly-ascending curve spread across the allowed range."""
        span = self.temp_max - self.temp_min
        duty_span = self.duty_max - self.duty_min
        points = []
        for i in range(self.point_count):
            fraction = i / max(self.point_count - 1, 1)
            temp = self.temp_min + round(span * fraction)
            duty = self.duty_min + round(duty_span * fraction)
            points.append((temp, duty))
        return points

    def points_writable(self, points):
        """Whether every point is inside the ranges the driver will accept.

        A card with no custom curve set reads back as all zeros, which is below both
        minimums, so the current curve cannot always be written back verbatim.
        """
        return bool(points) and all(
            self.temp_min <= temp <= self.temp_max
            and self.duty_min <= duty <= self.duty_max
            for temp, duty in points
        )

    def shape_nudged_baseline(self):
        """A valid curve guaranteed to differ from what the firmware currently holds.

        A commit that changes nothing is skipped entirely by the driver and reports
        success, which would make a pass here meaningless.
        """
        if self.points_writable(self.baseline_points):
            points = list(self.baseline_points)
        else:
            log.info(
                f"  baseline {self.baseline_points} is outside the writable ranges "
                f"(temp {self.temp_min}-{self.temp_max}, duty {self.duty_min}-{self.duty_max}); "
                "no custom curve is set. Using a generated curve instead."
            )
            points = self.shape_ascending()
        temp, duty = points[-1]
        nudged = duty - 1 if duty > self.duty_min else duty + 1
        points[-1] = (temp, max(self.duty_min, min(self.duty_max, nudged)))
        return points

    def shape_flat_dup_temps(self, duty):
        """What CoolerControl and LACT both write for a fixed speed."""
        points = [(self.temp_min, duty)]
        for _ in range(1, self.point_count):
            points.append((self.temp_max, duty))
        return points

    def shape_flat_ascending_temps(self, duty):
        """Same duty everywhere, but temps strictly increase."""
        span = self.temp_max - self.temp_min
        points = []
        for i in range(self.point_count):
            fraction = i / max(self.point_count - 1, 1)
            points.append((self.temp_min + round(span * fraction), duty))
        return points

    def shape_flat_all_same_temp(self, duty):
        return [(self.temp_max, duty)] * self.point_count

    def shape_descending_duty(self):
        """Ascending temps with descending duties.

        The reporter's LACT readback showed 56% at 40C followed by 35% at 55C, which
        suggests the firmware does not require monotonic duties. Worth confirming.
        """
        span = self.temp_max - self.temp_min
        duty_span = self.duty_max - self.duty_min
        points = []
        for i in range(self.point_count):
            fraction = i / max(self.point_count - 1, 1)
            temp = self.temp_min + round(span * fraction)
            duty = self.duty_max - round(duty_span * fraction)
            points.append((temp, duty))
        return points


class Report:
    """Accumulates findings so the summary states conclusions, not just raw output."""

    def __init__(self):
        self.findings = {}
        self.context = {}

    def record(self, key, value):
        self.findings[key] = value
        log.info(f"  finding: {key} = {value}")

    def as_dict(self, operations, snapshots=()):
        return {
            "version": __VERSION__,
            "context": self.context,
            "findings": self.findings,
            "snapshots": list(snapshots),
            "operations": [op.as_dict() for op in operations],
        }


# -------------------------------------------------------------------------------- discovery


def verify_root(dry_run):
    if dry_run:
        return
    if os.geteuid() != 0:
        log.error(
            "This script must be run with sudo/root privileges to write fan control settings."
        )
        sys.exit(1)


def use_device_path(device_path_arg):
    """Resolves a device directory given directly, as in the checked-in snapshots.

    The snapshots under scripts/rdna4_data/ are device directories, not a whole /sys
    tree, so hwmon is found beneath them rather than via /sys/class/hwmon.
    """
    device_path = Path(device_path_arg).resolve()
    if not device_path.is_dir():
        log.error(f"Device path {device_path} is not a directory.")
        return None, None
    hwmon_dirs = sorted((device_path / "hwmon").glob("hwmon*"))
    if not hwmon_dirs:
        log.error(f"No hwmon* directory under {device_path / 'hwmon'}.")
        return None, None
    return hwmon_dirs[0], device_path


def find_amdgpu_hwmon(sysfs_root, device_filter):
    """Returns (hwmon_path, device_path) for the first matching amdgpu card."""
    pattern = str(Path(sysfs_root) / "sys/class/hwmon/hwmon*/name")
    for name_file in sorted(glob.glob(pattern)):
        try:
            if "amdgpu" not in Path(name_file).read_text():
                continue
        except OSError:
            continue
        hwmon_path = Path(name_file).parent
        device_path = hwmon_path / "device"
        if device_path.is_symlink():
            device_path = device_path.resolve()
        if device_filter and device_filter not in str(device_path):
            continue
        return hwmon_path, device_path
    return None, None


def read_context(sysfs, hwmon_path, device_path, sysfs_root):
    """Everything needed to interpret the results on someone else's machine."""
    context = {"script_version": __VERSION__}
    try:
        context["kernel"] = os.uname().release
    except OSError:
        pass
    context["hwmon_path"] = str(hwmon_path)
    context["device_path"] = str(device_path)

    for label, rel in (
        ("pci_device", "device"),
        ("pci_vendor", "vendor"),
        ("pci_revision", "revision"),
        ("subsystem_device", "subsystem_device"),
        ("subsystem_vendor", "subsystem_vendor"),
        ("vbios_version", "vbios_version"),
        ("pp_features", "pp_features"),
        ("power_dpm_force_performance_level", "power_dpm_force_performance_level"),
        ("runtime_status", "power/runtime_status"),
    ):
        value = sysfs.read(device_path / rel)
        if value is not None:
            context[label] = value.strip()

    ppfeaturemask = sysfs.read(
        Path(sysfs_root) / "sys/module/amdgpu/parameters/ppfeaturemask"
    )
    if ppfeaturemask is not None:
        raw = ppfeaturemask.strip()
        context["ppfeaturemask"] = raw
        try:
            context["overdrive_bit_set"] = bool(int(raw, 0) & 0x4000)
        except ValueError:
            pass

    for label, rel in (("pwm1", "pwm1"), ("pwm1_enable", "pwm1_enable")):
        value = sysfs.read(hwmon_path / rel)
        if value is not None:
            context[label] = value.strip()
        context[f"{label}_writable"] = os.access(hwmon_path / rel, os.W_OK)

    fw_dir = device_path / "fw_version"
    if fw_dir.is_dir():
        firmware = {}
        for entry in sorted(fw_dir.iterdir()):
            value = sysfs.read(entry)
            if value is not None:
                firmware[entry.name] = value.strip()
        context["fw_version"] = firmware

    context["smu_boot_log"] = read_smu_boot_log()
    return context


def read_smu_boot_log():
    """The SMU interface version lines, which reveal driver/firmware mismatches."""
    try:
        result = subprocess.run(
            ["/usr/bin/journalctl", "-k", "-b", "--no-pager"],  # nosec B603
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
        source = result.stdout
    except (OSError, subprocess.SubprocessError):
        try:
            result = subprocess.run(
                ["/usr/bin/dmesg"],  # nosec B603
                capture_output=True,
                text=True,
                timeout=20,
                check=False,
            )
            source = result.stdout
        except (OSError, subprocess.SubprocessError):
            return []
    wanted = (
        "smu driver if version",
        "smu fw if version",
        "SMU driver if version not matched",
        "Overdrive is enabled",
        "initializing kernel modesetting",
    )
    return [
        line.strip() for line in source.splitlines() if any(w in line for w in wanted)
    ]


# -------------------------------------------------------------------------------- phases


def phase_0_probe(fan, sysfs, report):
    """Read-only capability probe. Nothing here touches the hardware."""
    line_filler()
    log.info("PHASE 0: capability probe (read-only)")
    line_filler()

    log.info("Files present under gpu_od/fan_ctrl:")
    present = {}
    for name in FAN_CTRL_FILES:
        path = fan.fan_ctrl_path / name
        if not path.exists():
            log.info(f"  {name}: ABSENT")
            present[name] = None
            continue
        mode = oct(path.stat().st_mode & 0o777)
        content = sysfs.read(path)
        if content is None:
            log.info(f"  {name}: present (mode {mode}) but READ FAILED")
            present[name] = {"mode": mode, "content": None, "empty": None}
            continue
        stripped = content.strip()
        present[name] = {"mode": mode, "content": content, "empty": stripped == ""}
        if stripped == "":
            log.warning(f"  {name}: present (mode {mode}) but reads EMPTY")
        else:
            log.info(f"  {name}: present (mode {mode})\n{content.rstrip()}")
    report.context["fan_ctrl_files"] = present

    # The point of the whole exercise: an existing file is not a supported feature.
    for name in ("fan_zero_rpm_enable", "fan_zero_rpm_stop_temperature"):
        entry = present.get(name)
        if entry is None:
            report.record(f"{name}_supported", False)
            log.info(f"  -> {name} does not exist; the feature is absent.")
        elif entry["empty"]:
            report.record(f"{name}_supported", False)
            log.warning(
                f"  -> {name} exists but reads EMPTY. The driver only emits content when the "
                f"feature is supported, so this card does NOT support it. Writes will return "
                f"ENOTSUPP (524). Detecting support by readability alone is wrong."
            )
        else:
            report.record(f"{name}_supported", True)

    curve = fan.read_fan_curve()
    if curve is None:
        log.error("fan_curve could not be read. Cannot continue.")
        return False
    fan.baseline_points = fan.parse_points(curve)
    fan.point_count = len(fan.baseline_points)
    has_limits = fan.parse_limits(curve)

    report.record("fan_curve_point_count", fan.point_count)
    report.record("fan_curve_has_od_range", has_limits)
    report.record("baseline_points", fan.baseline_points)
    if has_limits:
        report.record("temp_range", [fan.temp_min, fan.temp_max])
        report.record("duty_range", [fan.duty_min, fan.duty_max])
    else:
        log.error(
            "No OD_RANGE lines in fan_curve. The curve is not changeable "
            "(is overdrive enabled in ppfeaturemask?). Cannot continue."
        )
        return False
    if fan.point_count == 0:
        log.error("No curve points parsed from fan_curve. Cannot continue.")
        return False

    fan.log_snapshot("baseline")
    return True


def phase_1_baseline(fan, report):
    """Control experiment: can a valid curve be committed without touching zero-RPM?"""
    line_filler()
    log.info("PHASE 1: baseline curve commit, zero-RPM endpoints NEVER touched")
    line_filler()
    fan.sysfs.phase = "phase-1"

    points = fan.shape_nudged_baseline()
    _, commit_op = fan.apply(points, "baseline")
    fan.log_snapshot("after baseline commit")
    report.record("baseline_commit_ok", commit_op.ok)
    if not commit_op.ok:
        report.record("baseline_commit_errno", commit_op.errno)
        log.error(
            "A valid curve failed to commit even though zero-RPM was never written. "
            "The zero-RPM theory does not explain this card; see the kernel lines above "
            "for the rejection reason."
        )
    else:
        log.info("A valid curve commits cleanly when zero-RPM is left alone.")

    # A commit that changes nothing is skipped by the driver and always reports success.
    log.info("Committing again with no changes, to confirm the no-op short-circuit:")
    repeat_op = fan.commit("unchanged repeat")
    report.record("unchanged_commit_ok", repeat_op.ok)
    if repeat_op.ok and not commit_op.ok:
        log.warning(
            "The unchanged commit succeeded while the real one failed. This is why an apply "
            "sometimes appears to work: the driver skips the upload when nothing differs."
        )
    return commit_op.ok


def phase_2_shapes(fan, report):
    """Which curve shapes does the firmware accept?"""
    line_filler()
    log.info("PHASE 2: curve shape matrix, zero-RPM endpoints NEVER touched")
    line_filler()
    fan.sysfs.phase = "phase-2"

    mid_duty = (fan.duty_min + fan.duty_max) // 2
    shapes = [
        (
            "ascending",
            fan.shape_ascending(),
            "control: strictly ascending temps and duties",
        ),
        (
            "flat_dup_temps",
            fan.shape_flat_dup_temps(mid_duty),
            "what CoolerControl and LACT write for a fixed speed (duplicate temps)",
        ),
        (
            "flat_ascending_temps",
            fan.shape_flat_ascending_temps(mid_duty),
            "candidate replacement: one duty, strictly increasing temps",
        ),
        (
            "flat_all_same_temp",
            fan.shape_flat_all_same_temp(mid_duty),
            "every point at temp_max",
        ),
        (
            "descending_duty",
            fan.shape_descending_duty(),
            "ascending temps, descending duties",
        ),
    ]

    results = {}
    for name, points, purpose in shapes:
        thin_filler()
        log.info(f"shape '{name}': {purpose}")
        fan.reset_curve(f"{name} pre-reset")
        _, commit_op = fan.apply(points, name)
        snap = fan.log_snapshot(f"after {name}")
        accepted = commit_op.ok
        results[name] = {
            "written": points,
            "accepted": accepted,
            "errno": commit_op.errno,
            "errno_name": commit_op.errno_name,
            "readback": snap["points"],
        }
        if fan.sysfs.dry_run:
            continue
        if accepted and snap["points"] and snap["points"] != points:
            log.warning(
                f"  readback differs from what was written:\n"
                f"    wrote: {points}\n"
                f"    read:  {snap['points']}"
            )
            results[name]["readback_matches"] = False
        elif accepted:
            results[name]["readback_matches"] = True

    # Out-of-range values should be rejected at the point write with EINVAL, not at commit.
    thin_filler()
    log.info(
        "out-of-range checks (expect EINVAL on the point write, not EIO on commit)"
    )
    fan.reset_curve("range-checks pre-reset")

    below_min = max(fan.duty_min - 1, 0)
    op = fan.sysfs.write(
        fan.fan_curve_path, f"0 {fan.temp_min} {below_min}\n", "duty_below_min"
    )
    results["duty_below_min"] = {
        "errno": op.errno,
        "errno_name": op.errno_name,
        "ok": op.ok,
    }

    op = fan.sysfs.write(
        fan.fan_curve_path, f"0 {fan.temp_max + 5} {fan.duty_min}\n", "temp_above_max"
    )
    results["temp_above_max"] = {
        "errno": op.errno,
        "errno_name": op.errno_name,
        "ok": op.ok,
    }

    op = fan.sysfs.write(
        fan.fan_curve_path,
        f"{fan.point_count} {fan.temp_max} {fan.duty_min}\n",
        "index_out_of_range",
    )
    results["index_out_of_range"] = {
        "errno": op.errno,
        "errno_name": op.errno_name,
        "ok": op.ok,
        "note": f"index {fan.point_count}, one past the last displayed point",
    }

    # Does a half-written table commit?
    thin_filler()
    log.info("partial write: points 0..2 only, then commit")
    fan.reset_curve("partial pre-reset")
    partial = fan.shape_ascending()[:3]
    fan.write_points(partial, "partial")
    partial_commit = fan.commit("partial")
    results["partial_then_commit"] = {
        "written": partial,
        "accepted": partial_commit.ok,
        "errno": partial_commit.errno,
        "errno_name": partial_commit.errno_name,
    }
    fan.log_snapshot("after partial commit")

    report.record("shape_matrix", results)
    accepted_shapes = [n for n, r in results.items() if r.get("accepted")]
    rejected_shapes = [n for n, r in results.items() if r.get("accepted") is False]
    log.info(f"shapes accepted: {accepted_shapes}")
    log.info(f"shapes rejected: {rejected_shapes}")


def phase_3_reset(fan, report):
    """What does writing 'r' to fan_curve actually do?"""
    line_filler()
    log.info("PHASE 3: fan_curve reset semantics")
    line_filler()
    fan.sysfs.phase = "phase-3"

    # Put a distinctive curve in place so a restore is visible.
    marker = fan.shape_ascending()
    fan.apply(marker, "reset-marker")
    before = fan.log_snapshot("before reset")

    reset_op = fan.reset_curve("standalone")
    after = fan.log_snapshot("after reset, no commit")

    report.record("reset_ok", reset_op.ok)
    report.record(
        "reset_applies_without_commit",
        before["points"] != after["points"],
    )
    if before["points"] != after["points"]:
        log.info(
            "Writing 'r' changed the curve with no following 'c'. The kernel falls through "
            "from restore into commit, so a reset is itself an upload."
        )
    else:
        log.info("Writing 'r' did not visibly change the curve without a commit.")


def observe_flat_duty(fan, duty, settle_seconds, label):
    """Applies a flat curve and watches what the fan actually does.

    The curve is only a request. This records whether the firmware honours it, whether
    the fan ever reaches 0 RPM, and at what temperature the reading is valid, which is
    what tells us if zero-RPM behaviour is present even when the OD control is not.
    """
    thin_filler()
    log.info(f"observing a flat {duty}% curve ({label})")
    fan.reset_curve(f"{label} pre-reset")
    _, commit_op = fan.apply(fan.shape_flat_ascending_temps(duty), label)
    if not commit_op.ok:
        log.error(f"  could not apply the {duty}% curve; observation is meaningless")
        return {"duty": duty, "applied": False}

    samples = []
    for second in range(settle_seconds):
        pwm, rpm = fan.read_fan()
        temps = fan.read_temps()
        samples.append({"t": second, "pwm1": pwm, "rpm": rpm, "temps": temps})
        if second % 3 == 0 or second == settle_seconds - 1:
            hottest = max(temps.values()) if temps else None
            log.info(
                f"    t+{second:>2}s  pwm1={pwm} ({pwm_percent(pwm)})  rpm={rpm}  "
                f"temps={ {k: round(v, 1) for k, v in temps.items()} }  hottest={hottest}"
            )
        if not fan.sysfs.dry_run:
            sleep(1)

    rpms = [s["rpm"] for s in samples if s["rpm"] is not None]
    pwms = [s["pwm1"] for s in samples if s["pwm1"] is not None]
    result = {
        "duty": duty,
        "applied": True,
        "rpm_min": min(rpms) if rpms else None,
        "rpm_max": max(rpms) if rpms else None,
        "rpm_final": rpms[-1] if rpms else None,
        "pwm_final": pwms[-1] if pwms else None,
        "pwm_final_percent": pwm_percent(pwms[-1]) if pwms else None,
        "fan_ever_stopped": bool(rpms) and min(rpms) == 0,
        "samples": samples,
    }
    log.info(
        f"  -> requested {duty}%, settled at pwm1={result['pwm_final']} "
        f"({result['pwm_final_percent']}), rpm {result['rpm_min']}..{result['rpm_max']}, "
        f"fan ever stopped: {result['fan_ever_stopped']}"
    )
    return result


def pwm_percent(pwm):
    if pwm is None:
        return "n/a"
    return f"{round(pwm / 255 * 100)}%"


def phase_4_fan_response(fan, report, settle_seconds):
    """Does the fan actually follow the curve at the temperature the card idles at?

    Answers whether zero-RPM behaviour is present even though the OD control is not,
    and whether the firmware imposes a floor above the advertised duty minimum.
    """
    line_filler()
    log.info("PHASE 4: fan response to a flat curve (is zero-RPM behaviour present?)")
    line_filler()
    fan.sysfs.phase = "phase-4"

    log.info(
        f"idle temperatures: { {k: round(v, 1) for k, v in fan.read_temps().items()} }"
    )

    low = observe_flat_duty(fan, fan.duty_min, settle_seconds, "low duty")
    high_duty = min(
        fan.duty_max, max(fan.duty_min + 30, (fan.duty_min + fan.duty_max) // 2)
    )
    high = observe_flat_duty(fan, high_duty, settle_seconds, "high duty")

    report.record("fan_response_low", {k: v for k, v in low.items() if k != "samples"})
    report.record(
        "fan_response_high", {k: v for k, v in high.items() if k != "samples"}
    )

    if not (low.get("applied") and high.get("applied")):
        return
    if low["rpm_min"] is None or high["rpm_min"] is None:
        log.warning("  no RPM readings available; cannot judge fan response")
        return

    if low["fan_ever_stopped"]:
        log.warning(
            f"  The fan reached 0 RPM at the minimum duty of {fan.duty_min}%. Zero-RPM "
            "behaviour is active in firmware even though the OD control is absent, so the "
            "curve is NOT fully honoured at low temperatures."
        )
        report.record("zero_rpm_behaviour_present", True)
    else:
        log.info(
            f"  The fan kept spinning at the minimum duty of {fan.duty_min}% with the hottest "
            "sensor at idle. No zero-RPM behaviour observed at this temperature: the curve is "
            "honoured from its lowest point."
        )
        report.record("zero_rpm_behaviour_present", False)

    if high["rpm_final"] and low["rpm_final"] and high["rpm_final"] > low["rpm_final"]:
        log.info(
            f"  Duty changes take effect: {fan.duty_min}% -> {low['rpm_final']} RPM, "
            f"{high_duty}% -> {high['rpm_final']} RPM."
        )
        report.record("duty_changes_take_effect", True)
    else:
        log.warning(
            "  Raising the duty did not raise the fan speed. Either the firmware is "
            "overriding the curve or the fan had not settled."
        )
        report.record("duty_changes_take_effect", False)

    # A pwm1 reading well above the requested duty means the firmware set its own floor.
    if low["pwm_final"] is not None:
        observed = round(low["pwm_final"] / 255 * 100)
        report.record("low_duty_requested_vs_observed", [fan.duty_min, observed])
        if observed > fan.duty_min + 5:
            log.warning(
                f"  Requested {fan.duty_min}% but the fan settled at ~{observed}%. The "
                "firmware is enforcing a floor above the advertised duty minimum."
            )


def phase_5_zero_rpm(fan, report, assume_yes):
    """The decisive but risky experiment."""
    line_filler()
    log.warning("PHASE 5: zero-RPM endpoints (DESTRUCTIVE)")
    line_filler()
    log.warning(
        "If this card does not support zero-RPM, writing 'r' to fan_zero_rpm_enable makes the\n"
        "driver stage an unsupported feature bit and commit it. That bit is only cleared after a\n"
        "SUCCESSFUL upload, so fan control may stay broken until the amdgpu module is reloaded\n"
        "or the machine is rebooted. Fans should fall back to firmware automatic control, but\n"
        "you will not be able to set a curve until then."
    )
    if not assume_yes:
        try:
            answer = input("Type 'yes' to continue: ").strip().lower()
        except EOFError:
            answer = ""
        if answer != "yes":
            log.info("Skipping phase 5.")
            return
    fan.sysfs.phase = "phase-5"

    if not fan.zero_rpm_path.exists():
        log.info("fan_zero_rpm_enable does not exist on this card. Nothing to test.")
        report.record("zero_rpm_endpoint_present", False)
        return
    report.record("zero_rpm_endpoint_present", True)

    # 1. A plain value write. The support check runs before the mask update, so this
    #    should fail cleanly without side effects.
    thin_filler()
    log.info("step 1: write '0' to fan_zero_rpm_enable")
    value_op = fan.sysfs.write(fan.zero_rpm_path, "0\n", "zero_rpm value")
    report.record("zero_rpm_value_write_errno", value_op.errno)
    report.record("zero_rpm_value_write_errno_name", value_op.errno_name)

    # 2. Is a curve still committable after that?
    thin_filler()
    log.info("step 2: retry the baseline curve after the value write")
    fan.reset_curve("post-value-write")
    _, after_value = fan.apply(fan.shape_nudged_baseline(), "after value write")
    report.record("curve_ok_after_zero_rpm_value_write", after_value.ok)

    # 3. The reset write, which is the ungated path.
    thin_filler()
    log.info("step 3: write 'r' to fan_zero_rpm_enable (the ungated restore path)")
    reset_op = fan.sysfs.write(fan.zero_rpm_path, "r\n", "zero_rpm reset")
    report.record("zero_rpm_reset_errno", reset_op.errno)
    report.record("zero_rpm_reset_errno_name", reset_op.errno_name)

    # 4. The decisive check.
    thin_filler()
    log.info("step 4: retry the baseline curve after the reset write (DECISIVE)")
    points = fan.shape_ascending()
    points[-1] = (points[-1][0], max(fan.duty_min, points[-1][1] - 2))
    _, after_reset = fan.apply(points, "after zero_rpm reset")
    report.record("curve_ok_after_zero_rpm_reset", after_reset.ok)

    if after_value.ok and not after_reset.ok:
        log.error(
            "CONFIRMED: curve commits worked after writing a value to fan_zero_rpm_enable, but "
            "stopped working after writing 'r' to it. The reset path poisons the OverDrive "
            "table with an unsupported feature bit."
        )
    elif after_value.ok and after_reset.ok:
        log.info(
            "Not reproduced: curve commits still work after the zero-RPM reset. The EIO on this "
            "card has another cause; check the kernel lines from the failing operations."
        )

    # 5. Is it sticky?
    thin_filler()
    log.info("step 5: repeat the curve commit twice more")
    sticky = []
    for attempt in range(2):
        fan.reset_curve(f"sticky-{attempt}")
        retry_points = fan.shape_ascending()
        retry_points[-1] = (
            retry_points[-1][0],
            max(fan.duty_min, retry_points[-1][1] - 3 - attempt),
        )
        _, op = fan.apply(retry_points, f"sticky retry {attempt}")
        sticky.append(op.ok)
    report.record("curve_ok_on_retries_after_reset", sticky)

    # 6. Can anything clear it short of a module reload?
    thin_filler()
    log.info("step 6: recovery attempts")
    fan.reset_curve("recovery fan_curve")
    clk_path = fan.device_path / "pp_od_clk_voltage"
    if clk_path.exists():
        fan.sysfs.write(clk_path, "r\n", "recovery pp_od_clk_voltage reset")
        fan.sysfs.write(clk_path, "c\n", "recovery pp_od_clk_voltage commit")
    recovery_points = fan.shape_ascending()
    recovery_points[-1] = (
        recovery_points[-1][0],
        max(fan.duty_min, recovery_points[-1][1] - 5),
    )
    _, recovered = fan.apply(recovery_points, "after recovery")
    report.record("curve_ok_after_recovery_attempt", recovered.ok)
    if not recovered.ok:
        log.error(
            "Fan curve control is still broken. Reload the amdgpu module or reboot to restore it."
        )


def phase_6_restore(fan, report):
    line_filler()
    log.info("PHASE 6: restore and summary")
    line_filler()
    fan.sysfs.phase = "phase-6"

    # The reset restores the firmware's own defaults, which is the whole job when no
    # custom curve was set. Writing points back would create one that was not there.
    reset_op = fan.reset_curve("final")
    after_reset = fan.log_snapshot("after reset")
    if reset_op.ok and after_reset["points"] == fan.baseline_points:
        report.record("restored_to_baseline", True)
        log.info("  The reset restored the original curve. Nothing further to write.")
        return

    if fan.points_writable(fan.baseline_points):
        _, commit_op = fan.apply(fan.baseline_points, "restore baseline")
        final = fan.log_snapshot("final")
        restored = commit_op.ok and final["points"] == fan.baseline_points
    else:
        restored = False
        log.warning(
            f"  The original curve {fan.baseline_points} cannot be written back; it is "
            "outside the ranges the driver accepts."
        )

    report.record("restored_to_baseline", restored)
    if not restored:
        log.error(
            "Could not restore the original fan curve. Reboot to return the GPU to a known state."
        )


def print_summary(report, operations):
    line_filler()
    log.info("SUMMARY")
    line_filler()
    failures = [op for op in operations if not op.ok]
    if not failures:
        log.info("No failed operations.")
    else:
        log.info(f"{len(failures)} failed operation(s):")
        for op in failures:
            log.info(
                f"  [{op.phase}] {op.label}: wrote {op.wrote!r} -> "
                f"errno {op.errno} ({op.errno_name})"
            )
            for entry in op.kernel_log:
                if any(marker in entry for marker in DMESG_HIGHLIGHTS):
                    log.info(f"      kernel says: {entry}")

    thin_filler()
    log.info("Findings:")
    for key, value in report.findings.items():
        if key == "shape_matrix":
            log.info("  shape_matrix:")
            for name, result in value.items():
                verdict = result.get("accepted")
                state = (
                    "accepted"
                    if verdict
                    else ("rejected" if verdict is False else "n/a")
                )
                log.info(f"    {name}: {state} errno={result.get('errno')}")
            continue
        log.info(f"  {key}: {value}")


def parse_args():
    parser = argparse.ArgumentParser(
        description="CoolerControl diagnostic for AMD RDNA3/4 PMFW fan control",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument(
        "-v", "--version", action="version", version=f"\n {__VERSION__}"
    )
    parser.add_argument(
        "-d", "--debug", action="store_true", help="enable debug output"
    )
    parser.add_argument(
        "--destructive",
        action="store_true",
        help="run phase 5, which may leave fan control broken until reboot",
    )
    parser.add_argument(
        "--yes", action="store_true", help="skip the phase 5 confirmation prompt"
    )
    parser.add_argument(
        "--phase",
        action="append",
        type=int,
        metavar="N",
        help="run only these phases (repeatable); phase 0 always runs",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="log intended writes without performing them",
    )
    parser.add_argument(
        "--settle",
        type=int,
        default=15,
        metavar="SECONDS",
        help="seconds to watch the fan per duty step in phase 4 (default 15)",
    )
    parser.add_argument(
        "--sysfs-root", default="/", help="prefix for sysfs paths, for fixture testing"
    )
    parser.add_argument(
        "--device",
        default="",
        help="restrict to the GPU whose device path contains this string",
    )
    parser.add_argument(
        "--device-path",
        default="",
        metavar="PATH",
        help="use this device directory directly instead of searching /sys;\n"
        "pair with --dry-run to replay a snapshot, e.g.\n"
        "  --dry-run --device-path scripts/rdna4_data/rx9070xt",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    if args.debug:
        log.setLevel(logging.DEBUG)

    line_filler()
    log.info(f"CoolerControl RDNA3/4 PMFW fan control diagnostic v{__VERSION__}")
    line_filler()

    verify_root(args.dry_run)

    if args.device_path:
        hwmon_path, device_path = use_device_path(args.device_path)
    else:
        hwmon_path, device_path = find_amdgpu_hwmon(args.sysfs_root, args.device)
    if hwmon_path is None:
        log.error("No amdgpu hwmon device found. Exiting.")
        sys.exit(1)
    log.info(f"AMD GPU hwmon: {hwmon_path}")
    log.info(f"AMD GPU device: {device_path}")

    fan_ctrl_path = device_path / "gpu_od" / "fan_ctrl"
    if not fan_ctrl_path.is_dir():
        log.error(
            f"No PMFW fan control interface at {fan_ctrl_path}.\n"
            "This card is either pre-RDNA3 or overdrive is not enabled in the amdgpu\n"
            "ppfeaturemask. Nothing for this script to test."
        )
        sys.exit(1)

    kernel_log = KernelLog()
    sysfs = Sysfs(kernel_log, args.dry_run)
    report = Report()
    fan = FanCtrl(sysfs, device_path, hwmon_path)

    report.context.update(read_context(sysfs, hwmon_path, device_path, args.sysfs_root))
    for key, value in report.context.items():
        if key not in ("fw_version", "smu_boot_log", "fan_ctrl_files"):
            log.info(f"  {key}: {value}")
    for name, version in (report.context.get("fw_version") or {}).items():
        log.info(f"  fw {name}: {version}")
    for line in report.context.get("smu_boot_log", []):
        log.info(f"  boot: {line}")

    start = time()
    try:
        if not phase_0_probe(fan, sysfs, report):
            raise SystemExit(1)

        selected = set(args.phase or [])

        def should_run(number):
            return not selected or number in selected

        if should_run(1):
            phase_1_baseline(fan, report)
        if should_run(2):
            phase_2_shapes(fan, report)
        if should_run(3):
            phase_3_reset(fan, report)
        if should_run(4):
            phase_4_fan_response(fan, report, args.settle)
        if should_run(5):
            if args.destructive:
                phase_5_zero_rpm(fan, report, args.yes)
            else:
                log.info("Phase 5 (zero-RPM) skipped. Pass --destructive to run it.")
        if should_run(6):
            phase_6_restore(fan, report)
    finally:
        print_summary(report, sysfs.operations)
        Path(JSON_FILE).write_text(
            json.dumps(report.as_dict(sysfs.operations, fan.snapshots), indent=2) + "\n"
        )
        kernel_log.close()
        thin_filler()
        log.info(f"Completed in {time() - start:.1f}s")
        log.info(f"Output saved to {LOG_FILE} (readable) and {JSON_FILE} (structured).")
        log.info(
            "Both hold the same information. Send whichever is easier; "
            "the JSON if you can attach a file. Thank you for testing!"
        )


if __name__ == "__main__":
    main()
