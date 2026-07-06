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

const shellFiles = import.meta.glob('../**/*.{ts,vue}', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>

const KEY_PATTERN = /\bt\(\s*'([a-zA-Z0-9._-]+)'/g

function resolves(key: string): boolean {
    let node: any = en
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
                if (!resolves(key)) missing.push(`${path}: ${key}`)
            }
        }
        expect(found).toBeGreaterThan(20)
        expect(missing).toEqual([])
    })
})
