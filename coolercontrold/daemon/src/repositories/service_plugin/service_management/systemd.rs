// SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

use crate::cc_fs;
use crate::repositories::service_plugin::service_management::manager::{
    ServiceDefinition, ServiceManager, ServiceStatus,
};
use crate::repositories::service_plugin::service_management::{
    ensure_plugin_user, find_on_path, ServiceId, ServiceIdExt,
};
use crate::repositories::service_plugin::service_plugin_repo::CC_PLUGIN_USER;
use crate::repositories::utils::DirectCommand;
use crate::rt::sleep;
use anyhow::{anyhow, Result};
use std::fs::Permissions;
use std::ops::Not;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::time::Duration;
use strum::Display;

const SYSTEMCTL: &str = "systemctl";
const SYSTEMCTL_TIMEOUT: Duration = Duration::from_secs(10);
const SERVICE_FILE_PERMISSIONS: u32 = 0o644;
/// `systemctl stop` waits for the unit, but a unit that ignores its stop signal outlives it.
/// These bound the wait for the unit to actually leave.
const STOP_VERIFY_INTERVAL: Duration = Duration::from_millis(250);
const STOP_VERIFY_ATTEMPTS: u8 = 20;

#[derive(Clone, Debug)]
pub struct SystemdConfig {
    /// interval in seconds to limit number of `burst` starts
    pub start_limit_interval_sec: Option<u32>,
    /// number of starts allowed in `interval`
    pub start_limit_burst: Option<u32>,
    /// restart type (on-failure, always, etc.)
    pub restart: SystemdServiceRestartType,
    /// number of seconds to wait between stopping and starting service
    pub restart_sec: Option<u32>,
    /// number of seconds to wait for service to exit on it own, before sending SIGTERM
    pub timeout_stop_sec: Option<u32>,
}

impl Default for SystemdConfig {
    fn default() -> Self {
        Self {
            start_limit_interval_sec: Some(60),
            start_limit_burst: Some(10),
            restart: SystemdServiceRestartType::OnFailure,
            restart_sec: Some(1),
            timeout_stop_sec: Some(3),
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct SystemdManager {
    pub config: SystemdConfig,
}

impl SystemdManager {
    pub fn detected() -> bool {
        find_on_path(SYSTEMCTL).is_some()
    }

    /// Returns `(exit_code, stdout, stderr)`. `Err` only on spawn failure or timeout.
    async fn systemctl(cmd: &str, service_id: &ServiceId) -> Result<(i32, String, String)> {
        DirectCommand::new(SYSTEMCTL, SYSTEMCTL_TIMEOUT)
            .arg(cmd)
            .arg(service_id.to_service_name())
            .run_with_code()
            .await
    }

    /// Runs a `systemctl` subcommand that takes no unit argument.
    async fn systemctl_global(cmd: &str) -> Result<(i32, String, String)> {
        DirectCommand::new(SYSTEMCTL, SYSTEMCTL_TIMEOUT)
            .arg(cmd)
            .run_with_code()
            .await
    }

    /// Waits until the unit is no longer running, so no caller acts on a stop that has
    /// been reported but has not finished.
    async fn await_stopped(&self, service_id: &ServiceId) -> Result<()> {
        for _ in 0..STOP_VERIFY_ATTEMPTS {
            // Any status but running means there is nothing left to wait for: stopped, or
            // the unit file is already gone. A status that cannot be read is not proof that
            // the unit went down, so it keeps waiting.
            if let Ok(status) = self.status(service_id).await {
                if matches!(status, ServiceStatus::Running).not() {
                    return Ok(());
                }
            }
            sleep(STOP_VERIFY_INTERVAL).await;
        }
        Err(anyhow!(
            "Service {} was still running after its stop was reported",
            service_id.to_service_name()
        ))
    }
}

impl ServiceManager for SystemdManager {
    async fn add(&self, service_definition: ServiceDefinition) -> Result<()> {
        let dir_path = systemd_global_dir_path();
        cc_fs::create_dir_all(&dir_path).await?;
        let service_name = service_definition.service_id.to_service_name();
        let service_path = dir_path.join(format!("{service_name}.service"));
        let service_description = service_definition.service_id.to_description();
        if service_definition.username.is_some() {
            ensure_plugin_user(CC_PLUGIN_USER).await;
        }
        let unit_file = create_unit_file(&self.config, &service_description, service_definition)?;
        cc_fs::write_string(&service_path, unit_file).await?;
        cc_fs::set_permissions(
            &service_path,
            Permissions::from_mode(SERVICE_FILE_PERMISSIONS),
        )
        .await?;
        // The definition on disk just changed. systemd serves the copy it already has
        // until it is told to re-read them, so without this the unit keeps running under
        // the old definition and the write above has no effect.
        let (code, _, stderr) = Self::systemctl_global("daemon-reload").await?;
        if code != 0 {
            return Err(anyhow!("systemctl daemon-reload failed: {stderr}"));
        }
        Ok(())
    }

    async fn remove(&self, service_id: &ServiceId) -> Result<()> {
        // The stop has to be confirmed before the unit file goes, for the same reason it
        // does under OpenRC: removing the definition of a unit that is still up leaves a
        // process behind that no later service command can address.
        if let ServiceStatus::Unmanaged = self.status(service_id).await? {
            // Never installed, or already removed: there is nothing to stop or unlink.
            return Ok(());
        }
        self.stop(service_id).await?;
        let dir_path = systemd_global_dir_path();
        let service_name = service_id.to_service_name();
        let service_path = dir_path.join(format!("{service_name}.service"));
        cc_fs::remove_file(service_path).await
    }

    async fn start(&self, service_id: &ServiceId) -> Result<()> {
        let (code, _, stderr) = Self::systemctl("start", service_id).await?;
        if code != 0 {
            Err(anyhow!(
                "systemctl start {} failed: {stderr}",
                service_id.to_service_name()
            ))
        } else {
            Ok(())
        }
    }

    async fn stop(&self, service_id: &ServiceId) -> Result<()> {
        let (code, _, stderr) = Self::systemctl("stop", service_id).await?;
        if code != 0 {
            return Err(anyhow!(
                "systemctl stop {} failed: {stderr}",
                service_id.to_service_name()
            ));
        }
        self.await_stopped(service_id).await
    }

    async fn restart(&self, service_id: &ServiceId) -> Result<()> {
        let (code, _, stderr) = Self::systemctl("restart", service_id).await?;
        if code != 0 {
            Err(anyhow!(
                "systemctl restart {} failed: {stderr}",
                service_id.to_service_name()
            ))
        } else {
            Ok(())
        }
    }

    /// See: `https://www.freedesktop.org/software/systemd/man/latest/systemctl.html#Exit%20status`
    async fn status(&self, service_id: &ServiceId) -> Result<ServiceStatus> {
        let (code, _, _) = Self::systemctl("status", service_id).await?;
        match code {
            4 => Ok(ServiceStatus::Unmanaged),
            3 => Ok(ServiceStatus::Stopped(None)),
            0 => Ok(ServiceStatus::Running),
            _ => Err(anyhow!("Unexpected systemctl status exit code: {code}")),
        }
    }
}

#[inline]
fn systemd_global_dir_path() -> PathBuf {
    PathBuf::from("/etc/systemd/system")
}

fn create_unit_file(
    config: &SystemdConfig,
    description: &String,
    service_definition: ServiceDefinition,
) -> Result<String> {
    use std::fmt::Write;
    let mut service = String::new();
    writeln!(service, "[Unit]")?;
    writeln!(service, "Description={description}")?;
    if let Some(start_limit_interval) = config.start_limit_interval_sec {
        writeln!(service, "StartLimitIntervalSec={start_limit_interval}")?;
    }
    if let Some(start_limit_burst) = config.start_limit_burst {
        writeln!(service, "StartLimitBurst={start_limit_burst}")?;
    }
    writeln!(service, "[Service]")?;
    writeln!(service, "Type=simple")?;
    if let Some(username) = service_definition.username {
        writeln!(service, "User={username}")?;
        writeln!(service, "Group={username}")?;
        // Stops the plugin user escalating through a setuid binary or a file capability, which
        // is the whole point of running it unprivileged. Deliberately not applied to a
        // `privileged = true` plugin: that one already runs as root, so this would add nothing
        // while breaking any setuid or capability helper it legitimately calls.
        writeln!(service, "NoNewPrivileges=true")?;
    }
    if let Some(working_directory) = service_definition.wrk_dir {
        writeln!(
            service,
            "WorkingDirectory={}",
            working_directory.to_string_lossy()
        )?;
    }
    if let Some(env_vars) = service_definition.envs {
        for (var, val) in env_vars {
            let _ = writeln!(service, "Environment=\"{var}={val}\"");
        }
    }
    let program = service_definition.executable.to_string_lossy();
    let args = service_definition.args.join(" ");
    writeln!(service, "ExecStart={program} {args}")?;
    if service_definition.disable_restart_on_failure.not() {
        if config.restart != SystemdServiceRestartType::No {
            writeln!(service, "Restart={}", config.restart)?;
        }
        if let Some(restart_secs) = config.restart_sec {
            writeln!(service, "RestartSec={restart_secs}")?;
        }
    }
    if let Some(timeout_stop_sec) = config.timeout_stop_sec {
        writeln!(service, "TimeoutStopSec={timeout_stop_sec}")?;
    }
    Ok(service.trim().to_string())
}

#[derive(Copy, Clone, Display, Debug, Default, PartialEq, Eq)]
// Variant names map onto systemd's Restart= values: OnSuccess -> on-success.
#[strum(serialize_all = "kebab-case")]
#[allow(dead_code)]
pub enum SystemdServiceRestartType {
    #[default]
    No,
    Always,
    OnSuccess,
    OnFailure,
    OnAbnormal,
    OnAbort,
    OnWatch,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_definition() -> ServiceDefinition {
        ServiceDefinition {
            service_id: "test-plugin".to_string(),
            executable: PathBuf::from("/usr/bin/test-plugin"),
            args: Vec::with_capacity(0),
            username: Some(CC_PLUGIN_USER.to_string()),
            wrk_dir: None,
            envs: None,
            disable_restart_on_failure: false,
        }
    }

    /// Goal: an unprivileged plugin must not be able to climb back out through a setuid binary
    /// or a file capability, since running it as its own user is the only thing containing it.
    /// Methodology: the default definition carries a username, which is the unprivileged case.
    #[test]
    fn unit_file_blocks_privilege_escalation_for_an_unprivileged_plugin() {
        let unit = create_unit_file(
            &SystemdConfig::default(),
            &"Test".to_string(),
            base_definition(),
        )
        .expect("unit must render");

        assert!(unit.contains("NoNewPrivileges=true"), "{unit}");
    }

    /// Goal: a plugin the user deliberately gave root must keep working. The directive would add
    /// nothing there (it is already root) but would break a setuid or capability helper it calls.
    /// Methodology: a privileged plugin is expressed by the absence of a username, which is also
    /// what makes systemd default the unit to root.
    #[test]
    fn unit_file_does_not_restrict_a_privileged_plugin() {
        let mut definition = base_definition();
        definition.username = None;

        let unit = create_unit_file(&SystemdConfig::default(), &"Test".to_string(), definition)
            .expect("unit must render");

        assert!(unit.contains("NoNewPrivileges").not(), "{unit}");
        assert!(
            unit.contains("User=").not(),
            "a privileged plugin runs as root: {unit}"
        );
    }

    /// Goal: pin the exact strings written to `Restart=` in a generated unit
    /// file. systemd rejects the unit outright if these drift, and the Display
    /// impl is derived, so nothing else would catch a rename.
    #[test]
    fn restart_type_renders_systemd_values() {
        let cases = [
            (SystemdServiceRestartType::No, "no"),
            (SystemdServiceRestartType::Always, "always"),
            (SystemdServiceRestartType::OnSuccess, "on-success"),
            (SystemdServiceRestartType::OnFailure, "on-failure"),
            (SystemdServiceRestartType::OnAbnormal, "on-abnormal"),
            (SystemdServiceRestartType::OnAbort, "on-abort"),
            (SystemdServiceRestartType::OnWatch, "on-watch"),
        ];
        for (restart_type, expected) in cases {
            assert_eq!(restart_type.to_string(), expected);
        }
    }

    #[test]
    fn restart_type_defaults_to_no() {
        assert_eq!(SystemdServiceRestartType::default().to_string(), "no");
    }
}
