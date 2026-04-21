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

use crate::ENV_DBUS;
use anyhow::Result;
use log::{info, warn};
use moro_local::Scope;
use std::cell::Cell;
use std::env;
use std::ops::Not;
use std::rc::Rc;
use std::time::Duration;
use tokio::time::timeout;
use tokio_util::sync::CancellationToken;
use zbus::export::ordered_stream::OrderedStreamExt;
use zbus::{Connection, Proxy};

const SLEEP_DEFAULT_BUS_NAME: &str = "org.freedesktop.login1";
const SLEEP_OBJECTPATH: &str = "/org/freedesktop/login1";
const SLEEP_INTERFACE: &str = "org.freedesktop.login1.Manager";
const SIGNAL_PREPARE_FOR_SLEEP: &str = "PrepareForSleep";
// The whole DBus handshake (connect + proxy + AddMatch for PrepareForSleep) should complete in
// tens of milliseconds on a healthy system. We cap it so a wedged logind/dbus-broker can't block
// the main loop from ever starting; on timeout we fall back to the deaf listener.
const DBUS_SETUP_TIMEOUT_S: u64 = 5;

pub struct SleepListener {
    preparing_to_sleep: Rc<Cell<bool>>,
    resuming: Rc<Cell<bool>>,
}

impl<'s> SleepListener {
    pub async fn new(
        run_token: CancellationToken,
        scope: &'s Scope<'s, 's, Result<()>>,
    ) -> Result<Self> {
        let listener_enabled = env::var(ENV_DBUS)
            .ok()
            .and_then(|env_dbus| {
                env_dbus
                    .parse::<u8>()
                    .ok()
                    .map(|bb| bb != 0)
                    .or_else(|| Some(env_dbus.trim().to_lowercase() != "off"))
            })
            .unwrap_or(true);
        if listener_enabled.not() {
            info!("DBUS sleep listener disabled.");
            return Ok(Self::create_deaf_listener());
        }
        // We wrap the full setup (not just the connect) because we've seen the hang land on
        // the AddMatch inside `receive_signal` as well, not only on `Connection::system`.
        // See https://gitlab.com/coolercontrol/coolercontrol/-/issues/264.
        let setup = async {
            let conn = Connection::system().await?;
            let proxy = Proxy::new(
                &conn,
                SLEEP_DEFAULT_BUS_NAME,
                SLEEP_OBJECTPATH,
                SLEEP_INTERFACE,
            )
            .await?;
            let signal = proxy.receive_signal(SIGNAL_PREPARE_FOR_SLEEP).await?;
            Ok::<_, zbus::Error>((conn, signal))
        };
        let (conn, mut sleep_signal) =
            match timeout(Duration::from_secs(DBUS_SETUP_TIMEOUT_S), setup).await {
                Ok(Ok(pair)) => pair,
                Ok(Err(err)) => {
                    warn!("Could not connect to DBUS, sleep listener will not work: {err}");
                    return Ok(Self::create_deaf_listener());
                }
                Err(_) => {
                    warn!(
                        "DBUS sleep listener setup timed out after {DBUS_SETUP_TIMEOUT_S}s; \
                         continuing without it. Sleep/resume events will not be handled \
                         on this run."
                    );
                    return Ok(Self::create_deaf_listener());
                }
            };
        let listener = Self {
            preparing_to_sleep: Rc::new(Cell::new(false)),
            resuming: Rc::new(Cell::new(false)),
        };
        let preparing_to_sleep = Rc::clone(&listener.preparing_to_sleep);
        let resuming = Rc::clone(&listener.resuming);
        scope.spawn(async move {
            loop {
                tokio::select! {
                    () = run_token.cancelled() => break,
                    Some(msg) = sleep_signal.next() => {
                        let body = msg.body();
                        let to_sleep: bool = body.deserialize()?; // returns true if entering sleep, false when waking
                        if to_sleep {
                            info!("Received message that system is going to sleep.");
                            preparing_to_sleep.set(true);
                        } else {
                            info!("Received message that system is waking from sleep");
                            resuming.set(true);
                        }
                    },
                    else => break,
                }
            }
            let _ = conn.close().await;
            Ok::<(), zbus::Error>(())
        });

        Ok(listener)
    }

    fn create_deaf_listener() -> Self {
        Self {
            preparing_to_sleep: Rc::new(Cell::new(false)),
            resuming: Rc::new(Cell::new(false)),
        }
    }

    pub fn is_resuming(&self) -> bool {
        self.resuming.get()
    }

    pub fn resuming(&self, is_resuming: bool) {
        self.resuming.set(is_resuming);
    }

    pub fn is_not_preparing_to_sleep(&self) -> bool {
        self.preparing_to_sleep.get().not()
    }

    pub fn preparing_to_sleep(&self, is_preparing_to_sleep: bool) {
        self.preparing_to_sleep.set(is_preparing_to_sleep);
    }
}
