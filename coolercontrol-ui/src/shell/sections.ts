/*
 * CoolerControl - monitor and control your cooling and other devices
 * Copyright (c) 2021-2025  Guy Boldon and contributors
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
