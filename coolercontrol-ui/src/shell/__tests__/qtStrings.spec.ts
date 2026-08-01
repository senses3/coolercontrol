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

// The Qt app looks strings up by key from a cache the UI fills over IPC. Nothing at
// compile time connects the two sides, so a renamed or dropped key would surface as an
// English string in a translated UI, silently. These lock the contract from both ends.

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import en from '@/i18n/locales/en.ts'
import { QT_STRING_KEYS, buildQtStrings } from '@/shell/qtStrings.ts'

// The Qt sources sit outside this package, so import.meta.glob cannot reach them.
const qtDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../coolercontrol')
const readQtSources = (): string =>
    readdirSync(qtDir)
        .filter((f) => f.endsWith('.cpp'))
        .map((f) => readFileSync(join(qtDir, f), 'utf8'))
        .join('\n')

const resolve = (root: any, key: string): boolean => {
    let node = root
    for (const part of key.split('.')) {
        if (node == null || typeof node !== 'object' || !(part in node)) return false
        node = node[part]
    }
    return typeof node === 'string'
}

describe('qt string bridge', () => {
    it('builds a value for every declared key', () => {
        const built = buildQtStrings((k) => `translated:${k}`)
        expect(Object.keys(built).sort()).toEqual([...QT_STRING_KEYS].sort())
        expect(Object.values(built).every((v) => v.startsWith('translated:'))).toBe(true)
    })

    it('resolves every pushed key in the english locale', () => {
        const missing = Object.keys(buildQtStrings((k) => k))
            .map((k) => `desktop.${k}`)
            .filter((k) => !resolve(en, k))
        expect(missing).toEqual([])
    })

    // Guards the half of the contract TypeScript cannot see: Qt asks for these by
    // string literal, so a key dropped here becomes a silent English fallback there.
    it('pushes every key the Qt app looks up', () => {
        const cpp = readQtSources()
        expect(cpp.length).toBeGreaterThan(0)
        const looked = [...cpp.matchAll(/uiString\(\s*"([a-zA-Z0-9._-]+)"/g)].map((m) => m[1])
        expect(looked.length).toBeGreaterThan(0)
        const pushed = new Set(QT_STRING_KEYS as readonly string[])
        expect([...new Set(looked)].filter((k) => !pushed.has(k))).toEqual([])
    })
})
