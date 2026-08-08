// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { mdiChartLine, mdiCog, mdiFan, mdiHomeOutline, mdiMemory, mdiPowerPlug } from '@mdi/js'
import { StartupPage } from '@/models/UISettings.ts'

export type SectionId = 'home' | 'cooling' | 'monitoring' | 'devices' | 'settings' | 'plugins'

export interface ShellSection {
    id: SectionId
    labelKey: string
    icon: string
    routeName: string
}

// Rail order.
export const SHELL_SECTIONS: readonly ShellSection[] = Object.freeze([
    {
        id: 'home',
        labelKey: 'layout.shell.home',
        icon: mdiHomeOutline,
        routeName: 'section-home',
    },
    {
        id: 'cooling',
        labelKey: 'layout.shell.cooling',
        icon: mdiFan,
        routeName: 'section-cooling',
    },
    {
        id: 'monitoring',
        labelKey: 'layout.shell.monitoring',
        icon: mdiChartLine,
        routeName: 'section-monitoring',
    },
    {
        id: 'devices',
        labelKey: 'layout.shell.devices',
        icon: mdiMemory,
        routeName: 'section-devices',
    },
    {
        id: 'settings',
        labelKey: 'layout.shell.settings',
        icon: mdiCog,
        routeName: 'settings',
    },
])

// Conditional rail item, shown only when service plugins are present.
export const PLUGINS_SECTION: ShellSection = Object.freeze({
    id: 'plugins',
    labelKey: 'layout.shell.plugins',
    icon: mdiPowerPlug,
    routeName: 'plugins-overview',
})

export function sectionById(id: SectionId): ShellSection | undefined {
    if (id === 'plugins') return PLUGINS_SECTION
    return SHELL_SECTIONS.find((section) => section.id === id)
}

// Where the configured startup page lands in the shell. AppInfo's content moved
// onto Home, and the home dashboard lives under Monitoring. Single source for
// the `startup-page` route, the rail logo, and the boot redirect.
export function startupRouteName(page: StartupPage): string {
    switch (page) {
        case StartupPage.Controls:
            return 'section-cooling'
        case StartupPage.HomeDashboard:
            return 'section-monitoring'
        default:
            return 'section-home'
    }
}
