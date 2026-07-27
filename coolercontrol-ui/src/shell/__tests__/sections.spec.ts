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

const mainSource = import.meta.glob('../../main.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
})['../../main.ts'] as string

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

    // The `startup-page` route resolves its redirect through useSettingsStore(),
    // and the router's first navigation runs inside app.use(router). If pinia
    // were installed after that, the redirect would throw and the app would
    // never boot, which no type-check or build would catch.
    it('installs pinia before the router in main.ts', () => {
        const pinia = mainSource.indexOf('app.use(createPinia())')
        const router = mainSource.indexOf('app.use(router)')
        expect(pinia, 'app.use(createPinia()) in main.ts').toBeGreaterThan(-1)
        expect(router, 'app.use(router) in main.ts').toBeGreaterThan(-1)
        expect(pinia).toBeLessThan(router)
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
