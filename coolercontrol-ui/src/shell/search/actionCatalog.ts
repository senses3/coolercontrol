// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// The verbs the palette offers. Every one either navigates or opens the dialog
// that already owns the change, with two exceptions carried over verbatim from
// the rail's power menu (`restart-ui`, `open-in-browser`) and one from the
// Monitoring panel (`new-dashboard`), which behave here exactly as they do
// there, gates included or not.
//
// Labels reuse keys that already exist in all twelve locales; nothing here adds
// a translation. `keywords` are untranslated by design, as in settingsCatalog.

export const ACTION_IDS = [
    'new-profile',
    'new-function',
    'new-mode',
    'new-alert',
    'new-dashboard',
    'new-custom-sensor',
    'generate-profiles',
    'calibrate-fans',
    'hardware-detection',
    'hardware-report',
    'start-tour',
    'shortcuts',
    'restart-ui',
    'restart-daemon',
    'open-in-browser',
] as const

export type ActionId = (typeof ACTION_IDS)[number]

export interface ActionEntry {
    id: ActionId
    labelKey: string
    /** Outermost first. Rendered under the label. */
    breadcrumbKeys: readonly string[]
    keywords?: readonly string[]
    /** Only offered in the desktop app, mirroring ShellPowerMenuItems. */
    qtOnly?: boolean
}

const COOLING = 'layout.shell.cooling'
const MONITORING = 'layout.shell.monitoring'
const DEVICES = 'layout.shell.devices'
const HOME = 'layout.shell.home'
const RESTART_MENU = 'components.onboarding.restartMenu'

export const ACTION_ENTRIES: readonly ActionEntry[] = Object.freeze([
    {
        id: 'new-profile',
        labelKey: 'views.profiles.newProfile',
        breadcrumbKeys: [COOLING, 'layout.shell.coolingPanel.profiles'],
        keywords: ['create profile', 'add profile', 'fan curve', 'graph'],
    },
    {
        id: 'new-function',
        labelKey: 'views.functions.newFunction',
        breadcrumbKeys: [COOLING, 'layout.shell.coolingPanel.functions'],
        keywords: ['create function', 'add function', 'hysteresis'],
    },
    {
        id: 'new-mode',
        labelKey: 'views.modes.createMode',
        breadcrumbKeys: [COOLING, 'layout.shell.modes'],
        keywords: ['create mode', 'add mode', 'preset', 'snapshot'],
    },
    {
        id: 'new-alert',
        labelKey: 'views.alerts.newAlert',
        breadcrumbKeys: [MONITORING, 'layout.menu.alerts'],
        keywords: ['create alert', 'add alert', 'notification', 'warning'],
    },
    {
        id: 'new-dashboard',
        labelKey: 'layout.shell.monitoringPanel.newDashboard',
        breadcrumbKeys: [MONITORING, 'layout.menu.dashboards'],
        keywords: ['create dashboard', 'add dashboard', 'chart', 'graph'],
    },
    {
        id: 'new-custom-sensor',
        labelKey: 'layout.menu.tooltips.addCustomSensor',
        breadcrumbKeys: [DEVICES, 'layout.menu.customSensors'],
        keywords: ['create custom sensor', 'virtual sensor', 'mix', 'average', 'file'],
    },
    {
        id: 'generate-profiles',
        labelKey: 'components.wizards.generate.title',
        breadcrumbKeys: [COOLING],
        keywords: ['auto create', 'automatic', 'wizard', 'generate', 'setup fans'],
    },
    {
        id: 'calibrate-fans',
        labelKey: 'components.wizards.calibration.title',
        breadcrumbKeys: [COOLING],
        keywords: ['calibration', 'rpm', 'measure', 'start duty', 'wizard'],
    },
    {
        id: 'hardware-detection',
        labelKey: 'views.appInfo.detectionButton',
        breadcrumbKeys: [HOME],
        keywords: ['super-i/o', 'superio', 'chip', 'scan', 'probe', 'missing sensors'],
    },
    {
        id: 'hardware-report',
        labelKey: 'views.appInfo.hardwareReportButton',
        breadcrumbKeys: [HOME],
        keywords: ['diagnostics', 'bug report', 'support', 'paste', 'issue'],
    },
    {
        id: 'start-tour',
        labelKey: 'layout.settings.startTour',
        breadcrumbKeys: [HOME],
        keywords: ['onboarding', 'walkthrough', 'guide', 'introduction', 'help'],
    },
    {
        id: 'shortcuts',
        labelKey: 'views.shortcuts.shortcuts',
        breadcrumbKeys: [HOME],
        keywords: ['keybindings', 'hotkeys', 'keys'],
    },
    {
        id: 'restart-ui',
        labelKey: 'layout.topbar.restartUI',
        breadcrumbKeys: [RESTART_MENU],
        keywords: ['reload', 'refresh', 'reset interface'],
    },
    {
        id: 'restart-daemon',
        labelKey: 'layout.topbar.restartDaemonAndUI',
        breadcrumbKeys: [RESTART_MENU],
        keywords: ['reload daemon', 'coolercontrold', 'service', 'systemd'],
    },
    {
        id: 'open-in-browser',
        labelKey: 'layout.topbar.openInBrowser',
        breadcrumbKeys: [RESTART_MENU],
        keywords: ['web ui', 'external', 'firefox', 'chrome'],
        qtOnly: true,
    },
])
