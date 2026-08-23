// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

use crate::api::actor::ModeHandle;
use crate::device::UID;
use crate::system_event::{SystemEvent, SystemEventHandle, SystemEventKind};
use crate::ENV_DBUS;
use futures_util::StreamExt;
use log::{error, info, warn};
use schemars::JsonSchema;
use serde::Serialize;
use std::collections::HashMap;
use std::env;
use std::ops::Not;
use std::sync::{Arc, RwLock};
use std::time::Duration;
use tokio::time::timeout;
use tokio_util::sync::CancellationToken;
use zbus::{Connection, Proxy};

/// `power-profiles-daemon` and the `tuned-ppd` shim both publish this interface. The freedesktop
/// name is preferred; `net.hadess` is the pre-rename name that older builds still own.
const PPD_BUS_NAME: &str = "org.freedesktop.UPower.PowerProfiles";
const PPD_OBJECT_PATH: &str = "/org/freedesktop/UPower/PowerProfiles";
const PPD_LEGACY_BUS_NAME: &str = "net.hadess.PowerProfiles";
const PPD_LEGACY_OBJECT_PATH: &str = "/net/hadess/PowerProfiles";
const ACTIVE_PROFILE_PROPERTY: &str = "ActiveProfile";
const PROFILES_PROPERTY: &str = "Profiles";
/// Each entry of the `Profiles` array is a dict; this key holds the profile name.
const PROFILE_NAME_KEY: &str = "Profile";

/// Matches `sleep_listener`: cap the whole handshake so a wedged dbus-broker cannot stall the
/// listener forever. On timeout we run deaf and the daemon carries on.
const DBUS_SETUP_TIMEOUT_S: u64 = 5;

/// A point-in-time view of the power profile integration, for API consumers.
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct PowerProfileSnapshot {
    /// Profiles the system daemon offers. Empty when no power profile daemon is present, which
    /// is how a client knows to hide the feature.
    pub available: Vec<String>,
    /// The profile currently in effect, if one has been observed.
    pub active: Option<String>,
    /// Profile name to Mode UID. Profiles absent here are deliberately unmapped.
    pub modes: HashMap<String, UID>,
}

#[derive(Default)]
struct PowerProfileState {
    available: Vec<String>,
    active: Option<String>,
    modes: HashMap<String, UID>,
}

/// Shared state for the power profile integration: what the listener has observed, plus the
/// profile to Mode mapping.
///
/// Shared rather than owned because the listener runs on the Tokio sidecar while the config and
/// the API live on the main thread. That also means a mapping edit takes effect immediately
/// instead of at the next daemon restart.
#[derive(Clone, Default)]
pub struct PowerProfiles {
    state: Arc<RwLock<PowerProfileState>>,
}

impl PowerProfiles {
    pub fn new(modes: HashMap<String, UID>) -> Self {
        Self {
            state: Arc::new(RwLock::new(PowerProfileState {
                available: Vec::with_capacity(0),
                active: None,
                modes,
            })),
        }
    }

    /// The Mode to activate for `profile`, or `None` when the profile is unmapped.
    pub fn mode_for(&self, profile: &str) -> Option<UID> {
        let state = self.state.read().ok()?;
        state.modes.get(profile).cloned()
    }

    pub fn set_modes(&self, modes: HashMap<String, UID>) {
        if let Ok(mut state) = self.state.write() {
            state.modes = modes;
        }
    }

    /// Records what the listener found on the bus. Called once at connect.
    pub fn set_observed(&self, available: Vec<String>, active: Option<String>) {
        if let Ok(mut state) = self.state.write() {
            state.available = available;
            state.active = active;
        }
    }

    pub fn set_active(&self, active: Option<String>) {
        if let Ok(mut state) = self.state.write() {
            state.active = active;
        }
    }

    pub fn snapshot(&self) -> PowerProfileSnapshot {
        let Ok(state) = self.state.read() else {
            return PowerProfileSnapshot::default();
        };
        PowerProfileSnapshot {
            available: state.available.clone(),
            active: state.active.clone(),
            modes: state.modes.clone(),
        }
    }
}

/// Starts watching the system power profile, if dbus is enabled.
///
/// Fire and forget, like `SleepListener::new`: the connection and signal loop live on the Tokio
/// sidecar (zbus needs a Tokio reactor), and every failure degrades to running deaf rather than
/// failing daemon startup. Nothing is returned because the listener drives the SSE broadcast and
/// Mode activation itself and needs nothing from the main loop tick.
pub fn start(
    system_event_handle: SystemEventHandle,
    mode_handle: ModeHandle,
    profiles: PowerProfiles,
    run_token: CancellationToken,
) {
    if dbus_listener_enabled().not() {
        info!("DBUS power profile listener disabled.");
        return;
    }
    crate::sidecar::handle()
        .spawn(move || run_listener(system_event_handle, mode_handle, profiles, run_token));
}

fn dbus_listener_enabled() -> bool {
    env::var(ENV_DBUS)
        .ok()
        .and_then(|env_dbus| {
            env_dbus
                .parse::<u8>()
                .ok()
                .map(|bb| bb != 0)
                .or_else(|| Some(env_dbus.trim().to_lowercase() != "off"))
        })
        .unwrap_or(true)
}

/// Runs on the sidecar: connects to dbus, then reacts to `ActiveProfile` changes until shutdown.
async fn run_listener(
    system_event_handle: SystemEventHandle,
    mode_handle: ModeHandle,
    profiles: PowerProfiles,
    run_token: CancellationToken,
) {
    let Some((connection, proxy)) = connect().await else {
        return;
    };
    // Seed from the current value so the first real change reports an accurate `previous`, and so
    // startup does not activate a Mode and fight `apply_on_boot`.
    let mut current = proxy
        .get_property::<String>(ACTIVE_PROFILE_PROPERTY)
        .await
        .ok();
    profiles.set_observed(available_profiles(&proxy).await, current.clone());
    info!(
        "DBUS power profile listener connected. Active profile: {}",
        current.as_deref().unwrap_or("unknown")
    );
    let mut changes = proxy
        .receive_property_changed::<String>(ACTIVE_PROFILE_PROPERTY)
        .await;
    loop {
        tokio::select! {
            () = run_token.cancelled() => break,
            Some(change) = changes.next() => {
                let Ok(profile) = change.get().await else {
                    warn!("Failed to read the changed ActiveProfile value.");
                    continue;
                };
                // The property cache can replay the value we already hold.
                if current.as_deref() == Some(profile.as_str()) {
                    continue;
                }
                let previous = current.replace(profile.clone());
                handle_change(&system_event_handle, &mode_handle, &profiles, profile, previous)
                    .await;
            },
            else => break,
        }
    }
    let _ = connection.close().await;
}

/// Connects and returns a proxy for whichever bus name is actually served, or `None` when no
/// power profile daemon is present. `power-profiles-daemon`, `tuned-ppd`, and TLP-less systems
/// are all normal, so absence is logged at info and is not an error.
async fn connect() -> Option<(Connection, Proxy<'static>)> {
    let setup = async {
        let connection = Connection::system().await?;
        for (bus_name, object_path) in [
            (PPD_BUS_NAME, PPD_OBJECT_PATH),
            (PPD_LEGACY_BUS_NAME, PPD_LEGACY_OBJECT_PATH),
        ] {
            // The interface name matches the bus name for both variants.
            let proxy = Proxy::new(&connection, bus_name, object_path, bus_name).await?;
            if proxy
                .get_property::<String>(ACTIVE_PROFILE_PROPERTY)
                .await
                .is_ok()
            {
                return Ok::<_, zbus::Error>(Some((connection, proxy)));
            }
        }
        Ok(None)
    };
    match timeout(Duration::from_secs(DBUS_SETUP_TIMEOUT_S), setup).await {
        Ok(Ok(Some(pair))) => Some(pair),
        Ok(Ok(None)) => {
            info!(
                "No power profile daemon found on DBUS. Mode switching on power profile \
                 changes is unavailable."
            );
            None
        }
        Ok(Err(err)) => {
            warn!("Could not connect to DBUS, power profile listener will not work: {err}");
            None
        }
        Err(_) => {
            warn!(
                "DBUS power profile listener setup timed out after {DBUS_SETUP_TIMEOUT_S}s; \
                 continuing without it. Power profile changes will not be handled on this run."
            );
            None
        }
    }
}

/// Reads the profile names the daemon offers. An unreadable list is not fatal: the mapping still
/// works, a client just has nothing to populate a picker with.
async fn available_profiles(proxy: &Proxy<'static>) -> Vec<String> {
    let Ok(profiles) = proxy
        .get_property::<Vec<HashMap<String, zbus::zvariant::OwnedValue>>>(PROFILES_PROPERTY)
        .await
    else {
        warn!("Could not read the list of available power profiles.");
        return Vec::with_capacity(0);
    };
    profiles
        .iter()
        .filter_map(|entry| entry.get(PROFILE_NAME_KEY))
        .filter_map(|value| String::try_from(value.clone()).ok())
        .collect()
}

/// Broadcasts the change, then activates the mapped Mode if there is one.
///
/// The broadcast is unconditional so external consumers see every change even when the user has
/// mapped no Modes at all.
async fn handle_change(
    system_event_handle: &SystemEventHandle,
    mode_handle: &ModeHandle,
    profiles: &PowerProfiles,
    profile: String,
    previous: Option<String>,
) {
    info!(
        "System power profile changed to '{profile}' from '{}'.",
        previous.as_deref().unwrap_or("unknown")
    );
    profiles.set_active(Some(profile.clone()));
    let mode_uid = profiles.mode_for(&profile);
    system_event_handle.broadcast(SystemEvent {
        kind: SystemEventKind::PowerProfile,
        value: profile,
        previous,
    });
    let Some(mode_uid) = mode_uid else {
        return;
    };
    if let Err(err) = mode_handle.activate(mode_uid.clone()).await {
        error!("Failed to activate Mode {mode_uid} for the new power profile: {err}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    /// Goal: an unmapped profile must resolve to nothing, so an unconfigured system never
    /// activates a Mode by accident.
    /// Methodology: look up a profile that was never mapped.
    #[test]
    fn unmapped_profile_resolves_to_no_mode() {
        let profiles = PowerProfiles::new(HashMap::from([(
            "performance".to_string(),
            "mode-uid-1".to_string(),
        )]));

        assert_eq!(
            profiles.mode_for("performance").as_deref(),
            Some("mode-uid-1")
        );
        assert_eq!(profiles.mode_for("balanced"), None);
        assert_eq!(profiles.mode_for(""), None);
    }

    /// Goal: an empty mapping is the default and must resolve nothing rather than panic.
    /// Methodology: query the default value.
    #[test]
    fn default_profiles_resolve_nothing() {
        let profiles = PowerProfiles::default();

        assert_eq!(profiles.mode_for("balanced"), None);
        assert!(profiles.snapshot().modes.is_empty());
    }

    /// Goal: a mapping edit from the API must be visible to the listener without a restart,
    /// which is the reason the map is shared rather than moved into the sidecar task.
    /// Methodology: clone the handle (as the listener does), then replace through the original.
    #[test]
    fn replaced_modes_are_visible_through_an_existing_clone() {
        let profiles = PowerProfiles::default();
        let listener_view = profiles.clone();

        profiles.set_modes(HashMap::from([(
            "power-saver".to_string(),
            "quiet-mode".to_string(),
        )]));

        assert_eq!(
            listener_view.mode_for("power-saver").as_deref(),
            Some("quiet-mode"),
            "The listener must see mapping edits made through the API"
        );
    }

    /// Goal: prove the real connect path works against a live bus: the bus-name fallback, the
    /// `ActiveProfile` read, and the `Profiles` decode. None of this is exercised by the pure
    /// tests, and the decode of the `a{sv}` array is easy to get wrong.
    /// Methodology: needs a real system bus with power-profiles-daemon or tuned-ppd running, so
    /// it cannot run in CI. Run with `cargo test -- --ignored power_profile`.
    #[test]
    #[ignore = "requires a system D-Bus with a power profile daemon"]
    fn connects_to_a_live_power_profile_daemon() {
        crate::sidecar::ensure_test_handle();
        let observed = crate::rt::test_runtime(async {
            crate::sidecar::handle()
                .run(|| async {
                    let (connection, proxy) = connect().await?;
                    let active = proxy
                        .get_property::<String>(ACTIVE_PROFILE_PROPERTY)
                        .await
                        .ok();
                    let available = available_profiles(&proxy).await;
                    let _ = connection.close().await;
                    Some((active, available))
                })
                .await
                .expect("sidecar must run the probe")
        });

        let Some((active, available)) = observed else {
            panic!("No power profile daemon answered on the system bus.");
        };
        let active = active.expect("ActiveProfile must be readable");
        assert!(
            available.contains(&active),
            "The active profile '{active}' must appear in the available list {available:?}"
        );
        assert!(
            available.iter().all(|profile| profile.is_empty().not()),
            "Decoded profile names must not be empty: {available:?}"
        );
        println!("active: {active}, available: {available:?}");
    }

    /// Goal: `CC_DBUS` gates this listener the same way it gates the sleep listener, so one
    /// switch disables all dbus use.
    /// Methodology: set each documented form and read the gate back.
    #[test]
    #[serial]
    fn dbus_env_var_gates_the_listener() {
        // Safety: test is single-threaded and serialized; no concurrent env reads.
        unsafe { env::remove_var(ENV_DBUS) };
        assert!(dbus_listener_enabled(), "Absent means enabled");

        for enabled in ["1", "ON", "on", "anything-else"] {
            unsafe { env::set_var(ENV_DBUS, enabled) };
            assert!(dbus_listener_enabled(), "'{enabled}' must enable");
        }
        for disabled in ["0", "OFF", "off"] {
            unsafe { env::set_var(ENV_DBUS, disabled) };
            assert!(dbus_listener_enabled().not(), "'{disabled}' must disable");
        }
        unsafe { env::remove_var(ENV_DBUS) };
    }
}
