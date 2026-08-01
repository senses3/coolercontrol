// CoolerControl - monitor and control your cooling and other devices
// Copyright (c) 2021-2025  Guy Boldon and contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

#ifndef CONSTANTS_H
#define CONSTANTS_H

#include <string>

const std::string COOLER_CONTROL_VERSION = "4.3.1";
const std::string APP_ID = "org.coolercontrol.CoolerControl";
const std::string APP_ID_ALERT = "org.coolercontrol.CoolerControl-alert";
const std::string APP_ID_SYMBOLIC = "org.coolercontrol.CoolerControl-symbolic";
const std::string APP_ID_SYMBOLIC_ALERT = "org.coolercontrol.CoolerControl-symbolic-alert";
const std::string DBUS_SERVICE_NAME = "org.coolercontrol.CoolerControl.SingleInstance";
const std::string DBUS_PATH = "/";
const std::string SETTING_DAEMON_ADDRESS = "daemonAddress";
const std::string SETTING_DAEMON_PORT = "daemonPort";
const std::string SETTING_DAEMON_SSL_ENABLED = "daemonSSLEnabled";
const std::string SETTING_START_IN_TRAY = "startInTray";
const std::string SETTING_STARTUP_DELAY = "startupDelay";
const std::string SETTING_CLOSE_TO_TRAY = "closeToTray";
const std::string SETTING_ZOOM_FACTOR = "zoomFactor";
const std::string SETTING_WINDOW_GEOMETRY = "windowGeometry";
const std::string SETTING_ACCESS_TOKEN = "accessToken";
const std::string SETTING_ACCESS_TOKEN_ID = "accessTokenId";
// Strings the UI pushes over IPC for Qt-rendered dialogs, cached so a discarded
// renderer does not have to be asked.
const std::string SETTING_GROUP_TRANSLATIONS = "translations";
// Whether the user has been shown the one-time close-to-tray prompt.
const std::string SETTING_CLOSE_PROMPT_SHOWN = "closePromptShown";
// Identity and label of the sensors pinned in the UI, pushed over IPC.
const std::string SETTING_PINNED_SENSORS = "pinnedSensors";
// Require a normally valid TLS certificate. Off by default, because the daemon ships a
// self-signed one and the common case is a loopback connection.
const std::string SETTING_TLS_STRICT = "tlsStrict";
// SHA-256 pins accepted by the user for remote daemons, keyed by host:port.
const std::string SETTING_GROUP_TLS_PINS = "tlsPins";
const std::string DEFAULT_DAEMON_ADDRESS = "localhost";
constexpr int DEFAULT_DAEMON_PORT = 11987;
constexpr bool DEFAULT_DAEMON_SSL_ENABLED = true;
constexpr int DEFAULT_CONNECTION_TIMEOUT_MS = 8000;
// 2s is good at startup, so as not to hit the daemon with lots of requests at once (+UI)
constexpr int DEFAULT_CONNECTION_RETRY_INTERVAL_MS = 2000;
// How long the window stays hidden before the renderer is torn down. Above the UI's own
// 7s stale-history threshold, so a restore that reloads and a discard never disagree.
constexpr int DISCARD_DELAY_MS = 10000;
// Above this many pinned sensors the rows move into their own submenu, so they stop
// competing with Modes/Show/Quit for room in the main tray menu.
constexpr int TRAY_SENSORS_INLINE_MAX = 5;
// Readings refresh on this cadence while the tray menu is open, and not at all while it
// is closed. One bulk status request per tick, regardless of how many sensors are pinned.
constexpr int TRAY_SENSOR_POLL_MS = 1500;
// Stops the poll if a tray host never tells us the menu closed. Without this a missed
// aboutToHide would leave the timer running for the life of the process.
constexpr int TRAY_SENSOR_POLL_MAX_TICKS = 80;
const std::string WEBENGINE_PROFILE_NAME = "coolercontrol";
const std::string ENDPOINT_HEALTH = "/health";
const std::string ENDPOINT_TOKENS = "/tokens";
const std::string ENDPOINT_STATUS = "/status";
// Shown in the UI's token list. Kept stable so a re-provision replaces the old entry
// rather than accumulating one per launch.
const std::string ACCESS_TOKEN_LABEL = "CoolerControl Desktop";
const std::string ENDPOINT_MODES = "/modes";
const std::string ENDPOINT_MODES_ACTIVE = "/modes-active";
const std::string ENDPOINT_ALERTS = "/alerts";
const std::string ENDPOINT_SSE = "/sse";
// Narrows the multiplexed stream to the event kinds this client handles, so the
// once-per-poll status ticks stay off a connection with no use for them.
const std::string SSE_EVENTS_QUERY = "events=logs,modes,notifications";

#endif  // CONSTANTS_H
