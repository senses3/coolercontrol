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

// Every static translation key used by shell code must resolve in the
// english locale. Template-literal (dynamic) keys are not covered.

import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en.ts'
import { TOUR_KEY_PREFIX, TOUR_STEPS } from '@/shell/tour.ts'

const shellFiles = import.meta.glob('../**/*.{ts,vue}', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>

const localeFiles = import.meta.glob('../../i18n/locales/*.ts', { eager: true }) as Record<
    string,
    { default: any }
>

const KEY_PATTERN = /\bt\(\s*'([a-zA-Z0-9._-]+)'/g
const LOCALE_COUNT = 12

function resolves(root: any, key: string): boolean {
    let node: any = root
    for (const part of key.split('.')) {
        node = node?.[part]
        if (node == null) return false
    }
    return typeof node === 'string'
}

describe('shell i18n keys', () => {
    it('resolves every static key against the english locale', () => {
        const missing: string[] = []
        let found = 0
        for (const [path, source] of Object.entries(shellFiles)) {
            if (path.includes('__tests__')) continue
            for (const match of source.matchAll(KEY_PATTERN)) {
                const key = match[1]
                found += 1
                if (!resolves(en, key)) missing.push(`${path}: ${key}`)
            }
        }
        expect(found).toBeGreaterThan(20)
        expect(missing).toEqual([])
    })

    // The tour builds its keys from TOUR_STEPS at runtime, so the static sweep
    // above cannot see them and an unused-key cleanup cannot either. Checking
    // every locale is the point: a prune once took these out of all twelve.
    it('resolves every tour step key in every locale', () => {
        const locales = Object.entries(localeFiles).filter(([path]) => !path.endsWith('.d.ts'))
        expect(locales).toHaveLength(LOCALE_COUNT)

        const missing: string[] = []
        for (const [path, module] of locales) {
            for (const step of TOUR_STEPS) {
                for (const suffix of ['', 'Desc']) {
                    const key = `${TOUR_KEY_PREFIX}${step.key}${suffix}`
                    if (!resolves(module.default, key)) missing.push(`${path}: ${key}`)
                }
            }
        }
        expect(missing).toEqual([])
    })
})
