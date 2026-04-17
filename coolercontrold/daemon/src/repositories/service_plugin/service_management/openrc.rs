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

use super::{ensure_plugin_user, find_on_path, ServiceId, ServiceIdExt};
use crate::cc_fs;
use crate::repositories::service_plugin::service_management::manager::{
    ServiceDefinition, ServiceManager, ServiceStatus,
};
use crate::repositories::service_plugin::service_plugin_repo::CC_PLUGIN_USER;
use crate::repositories::utils::DirectCommand;
use anyhow::{anyhow, Result};
use std::fmt::Write;
use std::fs::Permissions;
use std::ops::Not;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::time::Duration;

const RC_SERVICE: &str = "rc-service";
const RC_SERVICE_TIMEOUT: Duration = Duration::from_secs(10);
const SERVICE_FILE_PERMISSIONS: u32 = 0o755;

#[derive(Clone, Debug, Default)]
pub struct OpenRcManager {}

impl OpenRcManager {
    pub fn detected() -> bool {
        find_on_path(RC_SERVICE).is_some()
    }

    /// Returns `(exit_code, stdout, stderr)`. `Err` only on spawn failure or timeout.
    async fn rc_service(cmd: &str, service_id: &ServiceId) -> Result<(i32, String, String)> {
        DirectCommand::new(RC_SERVICE, RC_SERVICE_TIMEOUT)
            .arg(service_id.to_service_name())
            .arg(cmd)
            .run_with_code()
            .await
    }
}

impl ServiceManager for OpenRcManager {
    async fn add(&self, service_definition: ServiceDefinition) -> Result<()> {
        let dir_path = service_dir_path();
        cc_fs::create_dir_all(&dir_path).await?;
        let service_name = service_definition.service_id.to_service_name();
        let service_description = service_definition.service_id.to_description();
        let service_path = dir_path.join(&service_name);
        if service_definition.username.is_some() {
            ensure_plugin_user(CC_PLUGIN_USER).await;
        }
        let service_file =
            create_service_file(&service_description, &service_name, &service_definition);
        cc_fs::write_string(&service_path, service_file).await?;
        cc_fs::set_permissions(
            &service_path,
            Permissions::from_mode(SERVICE_FILE_PERMISSIONS),
        )
        .await
    }

    async fn remove(&self, service_id: &ServiceId) -> Result<()> {
        let _ = self.stop(service_id).await;
        let service_path = service_dir_path().join(service_id.to_service_name());
        cc_fs::remove_file(service_path).await
    }

    async fn start(&self, service_id: &ServiceId) -> Result<()> {
        let (code, _, stderr) = Self::rc_service("start", service_id).await?;
        if code != 0 {
            Err(anyhow!(
                "rc-service start {} failed: {stderr}",
                service_id.to_service_name()
            ))
        } else {
            Ok(())
        }
    }

    async fn stop(&self, service_id: &ServiceId) -> Result<()> {
        let (code, _, stderr) = Self::rc_service("stop", service_id).await?;
        if code != 0 {
            Err(anyhow!(
                "rc-service stop {} failed: {stderr}",
                service_id.to_service_name()
            ))
        } else {
            Ok(())
        }
    }

    async fn status(&self, service_id: &ServiceId) -> Result<ServiceStatus> {
        let (code, stdout, stderr) = Self::rc_service("status", service_id).await?;
        let status_text = if stderr.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            stderr.trim().to_string()
        };
        #[allow(clippy::match_same_arms)]
        match code {
            0 => Ok(ServiceStatus::Running),
            // Exit code 3 is the POSIX standard for "stopped".
            3 => Ok(ServiceStatus::Stopped(Some(status_text))),
            // Exit code 1: either "does not exist" or a crashed/unclear state.
            1 if status_text.contains("does not exist") => Ok(ServiceStatus::Unmanaged),
            1 => Ok(ServiceStatus::Stopped(Some(status_text))),
            _ => Err(anyhow!(
                "Unexpected rc-service status exit code {} for {}: {}",
                code,
                service_id.to_service_name(),
                status_text,
            )),
        }
    }
}

#[inline]
fn service_dir_path() -> PathBuf {
    PathBuf::from("/etc/init.d")
}

fn create_service_file(
    description: &str,
    provide: &str,
    service_definition: &ServiceDefinition,
) -> String {
    let mut script = String::new();
    let args = service_definition.args.join(" ");
    let program_path = service_definition.executable.to_string_lossy();
    let _ = writeln!(script, "#!/sbin/openrc-run");
    let _ = writeln!(script);
    let _ = writeln!(script, "description=\"{description}\"");
    let _ = writeln!(script, "supervisor=\"supervise-daemon\"");
    let _ = writeln!(script, "command=\"{program_path}\"");
    let _ = writeln!(script, "command_args=\"{args}\"");
    let sd_args = build_supervise_daemon_args(service_definition);
    if sd_args.is_empty().not() {
        let _ = writeln!(script, "supervise_daemon_args=\"{sd_args}\"");
    }
    let _ = writeln!(script, "output_logger=\"logger -et '${{RC_SVCNAME}}'\"");
    let _ = writeln!(script, "error_logger=\"logger -et '${{RC_SVCNAME}}' -p3\"");
    let _ = writeln!(script);
    let _ = writeln!(script, "depend() {{");
    let _ = writeln!(script, "    use logger");
    let _ = writeln!(script, "    provide {provide}");
    let _ = write!(script, "}}");
    script
}

/// Builds the `supervise_daemon_args` value from user and env settings.
fn build_supervise_daemon_args(service_definition: &ServiceDefinition) -> String {
    let mut parts = Vec::with_capacity(4);
    if let Some(username) = &service_definition.username {
        parts.push(format!("-u {username}"));
    }
    if let Some(envs) = &service_definition.envs {
        for (var, val) in envs {
            parts.push(format!("-e {var}={val}"));
        }
    }
    parts.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_definition() -> ServiceDefinition {
        ServiceDefinition {
            service_id: "test-plugin".to_string(),
            executable: PathBuf::from("/usr/bin/test-plugin"),
            args: vec!["--port".to_string(), "8080".to_string()],
            username: None,
            wrk_dir: None,
            envs: None,
            disable_restart_on_failure: false,
        }
    }

    #[test]
    fn service_file_contains_required_directives() {
        // A basic service file must contain the shebang, supervisor,
        // command, logger directives, and depend block.
        let script =
            create_service_file("Test Plugin", "cc-plugin-test-plugin", &base_definition());
        assert!(script.starts_with("#!/sbin/openrc-run"));
        assert!(script.contains("description=\"Test Plugin\""));
        assert!(script.contains("supervisor=\"supervise-daemon\""));
        assert!(script.contains("command=\"/usr/bin/test-plugin\""));
        assert!(script.contains("command_args=\"--port 8080\""));
        assert!(script.contains("provide cc-plugin-test-plugin"));
        assert!(script.contains("use logger"));
    }

    #[test]
    fn service_file_does_not_use_old_background_mode() {
        // The script must use supervise-daemon, not the older
        // command_background approach.
        let script =
            create_service_file("Test Plugin", "cc-plugin-test-plugin", &base_definition());
        assert!(script.contains("command_background").not());
        assert!(script.contains("pidfile").not());
        assert!(script.contains("output_log=").not());
        assert!(script.contains("error_log=").not());
    }

    #[test]
    fn service_file_logs_to_syslog() {
        // Both stdout and stderr must be piped through logger to
        // syslog, matching the main daemon's init script pattern.
        let script =
            create_service_file("Test Plugin", "cc-plugin-test-plugin", &base_definition());
        assert!(script.contains("output_logger=\"logger -et '${RC_SVCNAME}'\""));
        assert!(script.contains("error_logger=\"logger -et '${RC_SVCNAME}' -p3\""));
    }

    #[test]
    fn service_file_includes_user_when_specified() {
        // When a username is provided, the supervise-daemon must
        // receive the -u flag to run as that user.
        let mut def = base_definition();
        def.username = Some("cc-plugin-user".to_string());
        let script = create_service_file("Test Plugin", "cc-plugin-test-plugin", &def);
        assert!(script.contains("supervise_daemon_args=\"-u cc-plugin-user\""));
    }

    #[test]
    fn service_file_omits_daemon_args_when_unneeded() {
        // Without a username or envs, supervise_daemon_args must be absent.
        let script =
            create_service_file("Test Plugin", "cc-plugin-test-plugin", &base_definition());
        assert!(script.contains("supervise_daemon_args").not());
    }

    #[test]
    fn service_file_includes_env_vars() {
        // Environment variables must appear as -e flags in
        // supervise_daemon_args.
        let mut def = base_definition();
        def.envs = Some(vec![("MY_VAR".to_string(), "value".to_string())]);
        let script = create_service_file("Test Plugin", "cc-plugin-test-plugin", &def);
        assert!(script.contains("supervise_daemon_args=\"-e MY_VAR=value\""));
    }

    #[test]
    fn service_file_combines_user_and_env_vars() {
        // When both username and env vars are set, they must appear
        // together in supervise_daemon_args.
        let mut def = base_definition();
        def.username = Some("cc-plugin-user".to_string());
        def.envs = Some(vec![("KEY".to_string(), "val".to_string())]);
        let script = create_service_file("Test Plugin", "cc-plugin-test-plugin", &def);
        assert!(script.contains("supervise_daemon_args=\"-u cc-plugin-user -e KEY=val\""));
    }

    #[test]
    fn service_file_omits_daemon_args_for_empty_envs() {
        // An empty envs list with no username must not produce
        // supervise_daemon_args.
        let mut def = base_definition();
        def.envs = Some(vec![]);
        let script = create_service_file("Test Plugin", "cc-plugin-test-plugin", &def);
        assert!(script.contains("supervise_daemon_args").not());
    }
}
