// SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

use crate::api::CCError;
use crate::cc_fs;
use crate::config::Config;
use crate::repositories::service_plugin::service_management::manager::{
    Manager, ServiceManager, ServiceStatus,
};
use crate::repositories::service_plugin::service_management::ServiceId;
use crate::repositories::service_plugin::service_manifest::{ServiceManifest, ServiceType};
use crate::repositories::service_plugin::service_plugin_repo::{ServicePluginRepo, CC_PLUGIN_USER};
use crate::repositories::utils::{ShellCommand, ShellCommandResult};
use anyhow::{anyhow, Context, Result};
use log::{debug, error, info, warn};
use std::collections::HashMap;
use std::fs::Permissions;
use std::ops::Not;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::time::Duration;

pub const PLUGIN_CONFIG_FILE_NAME: &str = "config.json";
const PLUGIN_UI_DIR_NAME: &str = "ui";
const PLUGIN_CONFIG_FILE_PERMISSIONS: u32 = 0o600;

pub struct PluginController {
    pub plugins: HashMap<ServiceId, ServiceManifest>,
    config: Option<Rc<Config>>,
    service_manager: Manager,
    is_systemd: bool,
    is_open_rc: bool,
}

impl PluginController {
    pub fn new(
        service_plugin_repo: &ServicePluginRepo,
        config: Rc<Config>,
        service_manager: Manager,
        is_systemd: bool,
        is_open_rc: bool,
    ) -> Self {
        Self {
            plugins: service_plugin_repo.get_plugins(),
            config: Some(config),
            service_manager,
            is_systemd,
            is_open_rc,
        }
    }

    /// Create a disabled controller with no plugins and no service manager.
    /// Used when the service plugin repo fails to initialize.
    pub fn new_disabled() -> Self {
        Self {
            plugins: HashMap::with_capacity(0),
            config: None,
            service_manager: Manager::Disabled,
            is_systemd: false,
            is_open_rc: false,
        }
    }

    pub async fn load_plugin_config_file(&self, plugin_id: &str) -> Result<String> {
        let manifest = self
            .plugins
            .get(plugin_id)
            .ok_or_else(|| CCError::NotFound {
                msg: "Plugin not found".to_string(),
            })?;
        let config_path = manifest.path.join(PLUGIN_CONFIG_FILE_NAME);
        let config_result = cc_fs::read_txt(&config_path).await.with_context(|| {
            format!(
                "Loading Plugin configuration file {}",
                config_path.display()
            )
        });
        match config_result {
            Ok(config) => Ok(config),
            Err(err) => {
                for cause in err.chain() {
                    if let Some(io_err) = cause.downcast_ref::<std::io::Error>() {
                        if io_err.kind() == std::io::ErrorKind::NotFound {
                            debug!(
                                "Plugin Config file for {plugin_id} not found. Using empty config file."
                            );
                            return Ok(String::new());
                        }
                    }
                }
                error!(
                    "Error reading Plugin configuration file: {} - {err}",
                    config_path.display()
                );
                Err(err)
            }
        }
    }

    pub async fn save_plugin_config_file(&self, plugin_id: &str, config: String) -> Result<()> {
        let manifest = self
            .plugins
            .get(plugin_id)
            .ok_or_else(|| CCError::NotFound {
                msg: "Plugin not found".to_string(),
            })?;
        let config_path = manifest.path.join(PLUGIN_CONFIG_FILE_NAME);
        cc_fs::write_string(&config_path, config)
            .await
            .with_context(|| {
                format!(
                    "Saving Plugin configuration file: {}",
                    config_path.display()
                )
            })?;
        if manifest.is_managed().not() {
            return Ok(());
        }
        let owner = (self.is_systemd || self.is_open_rc).then_some({
            if manifest.privileged {
                "root"
            } else {
                CC_PLUGIN_USER
            }
        });
        if let Err(err) = secure_config_file(&config_path, owner).await {
            warn!(
                "Failed to secure plugin config file {}: {err}",
                config_path.display()
            );
        }
        Ok(())
    }

    pub fn get_plugin_ui_dir(&self, plugin_id: &str) -> Result<PathBuf> {
        let dir = self
            .plugins
            .get(plugin_id)
            .ok_or_else(|| CCError::NotFound {
                msg: "Plugin not found".to_string(),
            })
            .and_then(|manifest| {
                let ui_dir = manifest.path.join(PLUGIN_UI_DIR_NAME);
                if ui_dir.exists() {
                    Ok(ui_dir)
                } else {
                    Err(CCError::NotFound {
                        msg: "Plugin doesn't contain a UI directory".to_string(),
                    })
                }
            })?;
        Ok(dir)
    }

    /// Returns the proxy port for a plugin that has `[proxy]` configured, or `None` if not set.
    pub fn get_proxy_port(&self, plugin_id: &str) -> Result<Option<u16>> {
        let manifest = self
            .plugins
            .get(plugin_id)
            .ok_or_else(|| CCError::NotFound {
                msg: "Plugin not found".to_string(),
            })?;
        Ok(manifest.proxy.as_ref().map(|p| p.port))
    }

    /// Start a managed integration plugin's service.
    pub async fn start_plugin(&self, plugin_id: &str) -> Result<()> {
        let service_id = self.get_integration_service_id(plugin_id)?;
        self.service_manager
            .start(&service_id)
            .await
            .with_context(|| format!("Starting plugin service: {plugin_id}"))
    }

    /// Stop a managed integration plugin's service.
    pub async fn stop_plugin(&self, plugin_id: &str) -> Result<()> {
        let service_id = self.get_integration_service_id(plugin_id)?;
        self.service_manager
            .stop(&service_id)
            .await
            .with_context(|| format!("Stopping plugin service: {plugin_id}"))
    }

    /// Restart a managed integration plugin's service.
    ///
    /// Handed to the init system as one operation. Doing it as a stop then a start leaves a
    /// window where the old process has not gone yet, and starting into that window is what
    /// leaves two of them running.
    pub async fn restart_plugin(&self, plugin_id: &str) -> Result<()> {
        let service_id = self.get_integration_service_id(plugin_id)?;
        self.service_manager
            .restart(&service_id)
            .await
            .with_context(|| format!("Restarting plugin service: {plugin_id}"))
    }

    /// Get the status of a plugin's service.
    pub async fn get_plugin_status(&self, plugin_id: &str) -> Result<ServiceStatus> {
        let manifest = self
            .plugins
            .get(plugin_id)
            .ok_or_else(|| CCError::NotFound {
                msg: "Plugin not found".to_string(),
            })?;
        if manifest.is_managed().not() {
            return Ok(ServiceStatus::Unmanaged);
        }
        let service_id = plugin_id.to_string();
        self.service_manager
            .status(&service_id)
            .await
            .with_context(|| format!("Getting plugin service status: {plugin_id}"))
    }

    /// Disable a plugin persistently.
    /// Integration plugins have their service stopped immediately.
    /// Device plugins require a daemon restart.
    pub async fn disable_plugin(&self, plugin_id: &str) -> Result<()> {
        let manifest = self
            .plugins
            .get(plugin_id)
            .ok_or_else(|| CCError::NotFound {
                msg: "Plugin not found".to_string(),
            })?;
        let config = self.config.as_ref().ok_or_else(|| CCError::InternalError {
            msg: "No config available".to_string(),
        })?;
        let mut disabled = config.get_disabled_plugins();
        if disabled.contains(&plugin_id.to_string()).not() {
            disabled.push(plugin_id.to_string());
            config.set_disabled_plugins(&disabled);
            config.save_config_file().await?;
        }
        // Stop integration plugins immediately
        if manifest.service_type == ServiceType::Integration && manifest.is_managed() {
            if let Err(err) = self.stop_plugin(plugin_id).await {
                info!("Could not stop plugin service on disable: {err}");
            }
        }
        Ok(())
    }

    /// Enable a previously disabled plugin.
    /// Integration plugins have their service started immediately.
    /// Device plugins require a daemon restart.
    pub async fn enable_plugin(&self, plugin_id: &str) -> Result<()> {
        let manifest = self
            .plugins
            .get(plugin_id)
            .ok_or_else(|| CCError::NotFound {
                msg: "Plugin not found".to_string(),
            })?;
        let config = self.config.as_ref().ok_or_else(|| CCError::InternalError {
            msg: "No config available".to_string(),
        })?;
        let mut disabled = config.get_disabled_plugins();
        if let Some(pos) = disabled.iter().position(|id| id == plugin_id) {
            disabled.swap_remove(pos);
            config.set_disabled_plugins(&disabled);
            config.save_config_file().await?;
        }
        // Start integration plugins immediately.
        if manifest.service_type != ServiceType::Integration {
            return Ok(());
        }
        if manifest.is_managed().not() {
            return Ok(());
        }
        if let Err(err) = self.install_and_restart(plugin_id, manifest).await {
            info!("Could not start plugin service on enable: {err}");
        }
        Ok(())
    }

    /// Installs a plugin's service definition, then brings the service up.
    ///
    /// A plugin that was disabled when the daemon started was skipped during registration,
    /// so nothing ever wrote its service definition and the init system does not know it
    /// exists. Starting it in that state fails and the plugin stays `Unmanaged` until the
    /// daemon is restarted. Installing first is what makes enabling take effect right away.
    async fn install_and_restart(&self, plugin_id: &str, manifest: &ServiceManifest) -> Result<()> {
        let service_id = self.get_integration_service_id(plugin_id)?;
        let definition =
            ServicePluginRepo::service_definition(&service_id, manifest).ok_or_else(|| {
                CCError::UserError {
                    msg: "Plugin manifest has no executable to manage".to_string(),
                }
            })?;
        self.service_manager
            .add(definition)
            .await
            .with_context(|| format!("Installing plugin service: {plugin_id}"))?;
        self.service_manager
            .restart(&service_id)
            .await
            .with_context(|| format!("Starting plugin service: {plugin_id}"))
    }

    /// Check if a plugin is disabled in config.
    pub fn is_plugin_disabled(&self, plugin_id: &str) -> bool {
        self.config
            .as_ref()
            .is_some_and(|c| c.get_disabled_plugins().contains(&plugin_id.to_string()))
    }

    /// Validate that a plugin is an integration type and return its service ID.
    fn get_integration_service_id(&self, plugin_id: &str) -> Result<ServiceId> {
        let manifest = self
            .plugins
            .get(plugin_id)
            .ok_or_else(|| CCError::NotFound {
                msg: "Plugin not found".to_string(),
            })?;
        if manifest.service_type != ServiceType::Integration {
            return Err(CCError::UserError {
                msg: "Lifecycle control is only available for integration plugins".to_string(),
            }
            .into());
        }
        if manifest.is_managed().not() {
            return Err(CCError::UserError {
                msg: "Plugin is not managed by the service manager".to_string(),
            }
            .into());
        }
        Ok(plugin_id.to_string())
    }
}

pub async fn secure_plugin_folder(path: &Path, owner: Option<&str>) -> Result<()> {
    if let Some(owner) = owner {
        // -R: recursive, -h: do not follow symlinks (set ownership on the link itself)
        let command = format!("chown -Rh {owner}:{owner} {}", path.display());
        match ShellCommand::new(&command, Duration::from_secs(5))
            .run()
            .await
        {
            ShellCommandResult::Success { .. } => {}
            ShellCommandResult::Error(stderr) => return Err(anyhow!("chown -Rh failed: {stderr}")),
        }
    }
    Ok(())
}

pub async fn secure_config_file(path: &Path, owner: Option<&str>) -> Result<()> {
    cc_fs::set_permissions(path, Permissions::from_mode(PLUGIN_CONFIG_FILE_PERMISSIONS)).await?;
    if let Some(owner) = owner {
        let command = format!("chown {owner}:{owner} {}", path.display());
        match ShellCommand::new(&command, Duration::from_secs(5))
            .run()
            .await
        {
            ShellCommandResult::Success { .. } => {}
            ShellCommandResult::Error(stderr) => return Err(anyhow!("chown failed: {stderr}")),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repositories::service_plugin::service_manifest::ConnectionType;

    fn is_root() -> bool {
        nix::unistd::geteuid().is_root()
    }

    /// Goal: a plugin disabled when the daemon started is skipped during registration, so
    /// nothing writes its service definition. Enabling it later has to install one before
    /// it can start, and the definition has to be the same one registration would have
    /// written. Method: build it from a manifest and pin the fields that matter.
    #[test]
    fn service_definition_is_built_from_the_manifest() {
        let manifest = ServiceManifest {
            id: "test-plugin".to_string(),
            service_type: ServiceType::Integration,
            description: None,
            version: None,
            url: None,
            executable: Some(PathBuf::from("/usr/bin/test-plugin")),
            args: vec!["--verbose".to_string()],
            envs: vec![("MY_VAR".to_string(), "value".to_string())],
            address: ConnectionType::None,
            privileged: true,
            proxy: None,
            path: PathBuf::from("/etc/coolercontrol/plugins/test-plugin"),
        };

        let definition =
            ServicePluginRepo::service_definition(&"test-plugin".to_string(), &manifest)
                .expect("a manifest with an executable yields a definition");

        assert_eq!(definition.executable, PathBuf::from("/usr/bin/test-plugin"));
        assert_eq!(definition.args, vec!["--verbose".to_string()]);
        // Privileged plugins run as root, so no user is set for the supervisor.
        assert!(definition.username.is_none());
        let envs = definition.envs.expect("log level is always passed through");
        assert!(envs.contains(&("MY_VAR".to_string(), "value".to_string())));
    }

    /// Goal: a manifest without an executable has nothing for an init system to manage, and
    /// must not produce a definition that would be installed as an empty service.
    /// Method: drop the executable and require nothing back.
    #[test]
    fn service_definition_is_absent_without_an_executable() {
        let manifest = ServiceManifest {
            id: "test-plugin".to_string(),
            service_type: ServiceType::Integration,
            description: None,
            version: None,
            url: None,
            executable: None,
            args: Vec::new(),
            envs: Vec::new(),
            address: ConnectionType::None,
            privileged: false,
            proxy: None,
            path: PathBuf::from("/etc/coolercontrol/plugins/test-plugin"),
        };

        assert!(
            ServicePluginRepo::service_definition(&"test-plugin".to_string(), &manifest).is_none()
        );
    }

    /// Goal: an unprivileged plugin must be supervised as the dedicated plugin user rather
    /// than root. Method: flip `privileged` and check the user that comes back.
    #[test]
    fn unprivileged_plugins_run_as_the_plugin_user() {
        let manifest = ServiceManifest {
            id: "test-plugin".to_string(),
            service_type: ServiceType::Integration,
            description: None,
            version: None,
            url: None,
            executable: Some(PathBuf::from("/usr/bin/test-plugin")),
            args: Vec::new(),
            envs: Vec::new(),
            address: ConnectionType::None,
            privileged: false,
            proxy: None,
            path: PathBuf::from("/etc/coolercontrol/plugins/test-plugin"),
        };

        let definition =
            ServicePluginRepo::service_definition(&"test-plugin".to_string(), &manifest)
                .expect("a manifest with an executable yields a definition");

        assert_eq!(definition.username.as_deref(), Some(CC_PLUGIN_USER));
    }

    #[test]
    fn test_secure_config_file_sets_600_permissions() {
        crate::sidecar::ensure_test_handle();
        crate::rt::test_runtime(async {
            let dir = tempfile::tempdir().unwrap();
            let config_path = dir.path().join("config.json");
            std::fs::write(&config_path, "{}").unwrap();
            std::fs::set_permissions(&config_path, Permissions::from_mode(0o644)).unwrap();

            // secure_config_file will set permissions and attempt chown.
            // chown may fail if not root, but permissions should still be set.
            let _ = secure_config_file(&config_path, Some("root")).await;

            let perms = std::fs::metadata(&config_path).unwrap().permissions();
            assert_eq!(
                perms.mode() & 0o777,
                PLUGIN_CONFIG_FILE_PERMISSIONS,
                "Config file should have 600 permissions"
            );
        });
    }

    #[test]
    fn test_secure_config_file_nonexistent_file_returns_error() {
        crate::sidecar::ensure_test_handle();
        crate::rt::test_runtime(async {
            let dir = tempfile::tempdir().unwrap();
            let config_path = dir.path().join("nonexistent.json");

            let result = secure_config_file(&config_path, Some("root")).await;
            assert!(result.is_err(), "Should fail for nonexistent file");
        });
    }

    #[test]
    fn test_secure_config_file_chown_fails_for_non_root() {
        crate::sidecar::ensure_test_handle();
        crate::rt::test_runtime(async {
            if is_root() {
                // Skip: chown won't fail when running as root
                return;
            }
            let dir = tempfile::tempdir().unwrap();
            let config_path = dir.path().join("config.json");
            std::fs::write(&config_path, "{}").unwrap();

            let result = secure_config_file(&config_path, Some("root")).await;
            assert!(
                result.is_err(),
                "chown to root should fail when not running as root"
            );
        });
    }

    #[test]
    fn test_secure_config_file_chown_succeeds_as_root() {
        crate::sidecar::ensure_test_handle();
        crate::rt::test_runtime(async {
            if !is_root() {
                // Skip: requires root privileges
                return;
            }
            let dir = tempfile::tempdir().unwrap();
            let config_path = dir.path().join("config.json");
            std::fs::write(&config_path, "{}").unwrap();

            let result = secure_config_file(&config_path, Some("root")).await;
            assert!(result.is_ok(), "chown to root should succeed as root");

            let perms = std::fs::metadata(&config_path).unwrap().permissions();
            assert_eq!(
                perms.mode() & 0o777,
                PLUGIN_CONFIG_FILE_PERMISSIONS,
                "Config file should have 600 permissions"
            );
        });
    }

    #[test]
    fn test_secure_config_file_permissions_maintained_after_rewrite() {
        crate::sidecar::ensure_test_handle();
        crate::rt::test_runtime(async {
            let dir = tempfile::tempdir().unwrap();
            let config_path = dir.path().join("config.json");
            std::fs::write(&config_path, "{}").unwrap();

            let _ = secure_config_file(&config_path, Some("root")).await;

            // Simulate a rewrite that resets permissions
            std::fs::write(&config_path, "{\"updated\": true}").unwrap();
            std::fs::set_permissions(&config_path, Permissions::from_mode(0o644)).unwrap();

            let _ = secure_config_file(&config_path, Some("root")).await;

            let perms = std::fs::metadata(&config_path).unwrap().permissions();
            assert_eq!(
                perms.mode() & 0o777,
                PLUGIN_CONFIG_FILE_PERMISSIONS,
                "Permissions should be restored to 600 after re-securing"
            );
        });
    }

    #[test]
    fn test_secure_config_file_no_owner_skips_chown() {
        crate::sidecar::ensure_test_handle();
        crate::rt::test_runtime(async {
            let dir = tempfile::tempdir().unwrap();
            let config_path = dir.path().join("config.json");
            std::fs::write(&config_path, "{}").unwrap();
            std::fs::set_permissions(&config_path, Permissions::from_mode(0o644)).unwrap();

            let result = secure_config_file(&config_path, None).await;
            assert!(result.is_ok(), "Should succeed without chown");

            let perms = std::fs::metadata(&config_path).unwrap().permissions();
            assert_eq!(
                perms.mode() & 0o777,
                PLUGIN_CONFIG_FILE_PERMISSIONS,
                "Config file should have 600 permissions even without chown"
            );
        });
    }
}
