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

// The app loads reflect-metadata via an injected script, tests must import it themselves.
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en.ts'
import { StartupPage } from '@/models/UISettings.ts'
import { PLUGINS_SECTION, SHELL_SECTIONS, sectionById, startupRouteName } from '../sections.ts'

const routerSource = import.meta.glob('../../router/index.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
})['../../router/index.ts'] as string

describe('shell sections', () => {
    it('defines the five rail sections in order', () => {
        expect(SHELL_SECTIONS.map((s) => s.id)).toEqual([
            'home',
            'cooling',
            'monitoring',
            'devices',
            'settings',
        ])
    })

    it('has unique route names and icons', () => {
        const all = [...SHELL_SECTIONS, PLUGINS_SECTION]
        const routeNames = all.map((s) => s.routeName)
        expect(new Set(routeNames).size).toBe(routeNames.length)
        for (const section of all) {
            expect(section.icon.length).toBeGreaterThan(0)
        }
    })

    it('has an english translation for every label key', () => {
        for (const section of [...SHELL_SECTIONS, PLUGINS_SECTION]) {
            const path = section.labelKey.split('.')
            let node: any = en
            for (const part of path) node = node?.[part]
            expect(node, section.labelKey).toBeTypeOf('string')
        }
    })

    it('resolves sections by id', () => {
        expect(sectionById('cooling')?.routeName).toBe('section-cooling')
        expect(sectionById('plugins')?.routeName).toBe('plugins-overview')
    })

    // The settings store's setup calls useI18n() and inject(), so it can only be
    // created from inside a component setup. Route redirects and guards resolve
    // outside any component, so a store call there throws during the router's
    // first navigation and the app never boots. Neither type-check nor build
    // catches it. Resolve such targets in a component instead (see ShellRail).
    it('uses no pinia stores in the router', () => {
        expect(routerSource).not.toMatch(/use[A-Za-z]*Store\s*\(/)
    })

    it('maps every startup page onto a real section route', () => {
        expect(startupRouteName(StartupPage.AppInfo)).toBe('section-home')
        expect(startupRouteName(StartupPage.Controls)).toBe('section-cooling')
        expect(startupRouteName(StartupPage.HomeDashboard)).toBe('section-monitoring')
        // Every target must be a route the rail actually owns, otherwise the
        // logo and the boot redirect would navigate nowhere.
        const railRoutes = new Set(SHELL_SECTIONS.map((s) => s.routeName))
        for (const page of Object.values(StartupPage)) {
            expect(railRoutes.has(startupRouteName(page)), String(page)).toBe(true)
        }
    })
})
