// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Fixed destinations: section landings, the pages hanging off them, and the
// settings cards. Doubles as the browse map the palette shows before anything
// is typed, which is what makes it readable as a site map rather than an empty
// box on first run.
//
// Every label reuses a key that already exists in all twelve locales.

export interface PageEntry {
    id: string
    labelKey: string
    routeName: string
    params?: Record<string, string>
    /** Section this sits under. The browse map groups by it, in this order. */
    groupKey: string
    keywords?: readonly string[]
    /** Only listed when at least one service plugin is loaded. */
    pluginsOnly?: boolean
    /** Only listed in the desktop app. */
    qtOnly?: boolean
}

export const HOME = 'layout.shell.home'
export const COOLING = 'layout.shell.cooling'
export const MONITORING = 'layout.shell.monitoring'
export const DEVICES = 'layout.shell.devices'
export const SETTINGS = 'layout.shell.settings'
export const PLUGINS = 'layout.shell.plugins'

/** Browse-map column order. */
export const PAGE_GROUPS: readonly string[] = Object.freeze([
    HOME,
    COOLING,
    MONITORING,
    DEVICES,
    SETTINGS,
    PLUGINS,
])

export const PAGE_ENTRIES: readonly PageEntry[] = Object.freeze([
    {
        id: 'page-home',
        labelKey: 'layout.shell.homePanel.overview',
        routeName: 'section-home',
        groupKey: HOME,
        keywords: ['start', 'dashboard', 'summary', 'status'],
    },
    {
        id: 'page-logs',
        labelKey: 'layout.shell.homePanel.logs',
        routeName: 'home-logs',
        groupKey: HOME,
        keywords: ['journal', 'errors', 'warnings', 'debug', 'diagnostics'],
    },
    {
        id: 'page-cooling',
        labelKey: 'layout.shell.cooling',
        routeName: 'section-cooling',
        groupKey: COOLING,
        keywords: ['fans', 'pumps', 'channels', 'speed', 'curve', 'control'],
    },
    {
        id: 'page-modes',
        labelKey: 'layout.shell.modes',
        routeName: 'cooling-modes',
        groupKey: COOLING,
        keywords: ['presets', 'profiles set', 'switch', 'snapshot'],
    },
    {
        id: 'page-monitoring',
        labelKey: 'layout.menu.dashboards',
        routeName: 'section-monitoring',
        groupKey: MONITORING,
        keywords: ['charts', 'graphs', 'temps', 'sensors', 'history'],
    },
    {
        id: 'page-alerts',
        labelKey: 'views.alerts.alertsOverview',
        routeName: 'monitoring-alerts',
        groupKey: MONITORING,
        keywords: ['warnings', 'notifications', 'thresholds', 'silence'],
    },
    {
        id: 'page-devices',
        labelKey: 'layout.shell.devices',
        routeName: 'section-devices',
        groupKey: DEVICES,
        keywords: ['hardware', 'gpu', 'cpu', 'hwmon', 'liquidctl', 'all devices'],
    },
    {
        id: 'page-manage-sensors',
        labelKey: 'layout.shell.manageSensors.title',
        routeName: 'devices-manage-sensors',
        groupKey: DEVICES,
        keywords: ['enable', 'disable', 'hide', 'blacklist', 'unused'],
    },
    {
        id: 'page-settings-general',
        labelKey: 'layout.settings.general',
        routeName: 'settings',
        params: { tabNumber: 'general' },
        groupKey: SETTINGS,
        keywords: ['preferences', 'options'],
    },
    {
        id: 'page-settings-appearance',
        labelKey: 'layout.settings.appearance',
        routeName: 'settings',
        params: { tabNumber: 'appearance' },
        groupKey: SETTINGS,
        keywords: ['theme', 'look', 'colors', 'colours', 'font'],
    },
    {
        id: 'page-settings-theme',
        labelKey: 'layout.settings.customTheme.title',
        routeName: 'settings',
        params: { tabNumber: 'theme' },
        groupKey: SETTINGS,
        keywords: ['accent', 'background', 'border', 'palette', 'colors', 'colours'],
    },
    {
        id: 'page-settings-daemon',
        labelKey: 'views.daemon.title',
        routeName: 'settings',
        params: { tabNumber: 'daemon' },
        groupKey: SETTINGS,
        keywords: ['coolercontrold', 'service', 'backend', 'polling'],
    },
    {
        id: 'page-settings-desktop',
        labelKey: 'layout.settings.desktop',
        routeName: 'settings',
        params: { tabNumber: 'desktop' },
        groupKey: SETTINGS,
        keywords: ['tray', 'window', 'zoom', 'app'],
        qtOnly: true,
    },
    {
        id: 'page-plugins',
        labelKey: 'layout.plugins.overview',
        routeName: 'plugins-overview',
        groupKey: PLUGINS,
        keywords: ['extensions', 'services', 'addons'],
        pluginsOnly: true,
    },
])
