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

export type SectionId = 'home' | 'cooling' | 'monitoring' | 'devices' | 'settings' | 'plugins'

export interface ShellSection {
    id: SectionId
    labelKey: string
    icon: string
    routeName: string
    // Redesign phase in which this section gets its real content.
    phase: number
}

// Rail order. Settings reuses the existing settings route until phase 3.
export const SHELL_SECTIONS: readonly ShellSection[] = Object.freeze([
    {
        id: 'home',
        labelKey: 'layout.shell.home',
        icon: mdiHomeOutline,
        routeName: 'section-home',
        phase: 4,
    },
    {
        id: 'cooling',
        labelKey: 'layout.shell.cooling',
        icon: mdiFan,
        routeName: 'section-cooling',
        phase: 1,
    },
    {
        id: 'monitoring',
        labelKey: 'layout.shell.monitoring',
        icon: mdiChartLine,
        routeName: 'section-monitoring',
        phase: 2,
    },
    {
        id: 'devices',
        labelKey: 'layout.shell.devices',
        icon: mdiMemory,
        routeName: 'section-devices',
        phase: 3,
    },
    {
        id: 'settings',
        labelKey: 'layout.shell.settings',
        icon: mdiCog,
        routeName: 'settings',
        phase: 3,
    },
])

// Conditional rail item, shown only when service plugins are present.
export const PLUGINS_SECTION: ShellSection = Object.freeze({
    id: 'plugins',
    labelKey: 'layout.shell.plugins',
    icon: mdiPowerPlug,
    routeName: 'plugins-overview',
    phase: 5,
})

export function sectionById(id: SectionId): ShellSection | undefined {
    if (id === 'plugins') return PLUGINS_SECTION
    return SHELL_SECTIONS.find((section) => section.id === id)
}
