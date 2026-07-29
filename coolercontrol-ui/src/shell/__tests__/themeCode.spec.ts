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

import { describe, expect, it } from 'vitest'
import { decodeThemeCode, encodeThemeCode, type ThemeHexTokens } from '../themeCode.ts'
import { INSTALLED_THEMES, THEME_TOKEN_KEYS } from '../themes.ts'

const dracula = INSTALLED_THEMES.find((theme) => theme.id === 'dracula')!
const tokens: ThemeHexTokens = { ...dracula.tokens }

describe('theme code wire order', () => {
    /// Goal: a cct1 code decodes into the colors it was written with. Its six
    /// slots are positional, so anything inserted ahead of them silently
    /// repaints old shared codes. Method: pin the first six keys.
    it('keeps the first six tokens frozen for cct1 codes', () => {
        expect(THEME_TOKEN_KEYS.slice(0, 6)).toEqual([
            'accent',
            'bgOne',
            'bgTwo',
            'borderOne',
            'textColor',
            'textColorSecondary',
        ])
    })

    /// Goal: tokens added since cct1 stay appended, so the same positional
    /// argument holds for every code already in the wild.
    it('appends newer tokens after the cct1 block', () => {
        expect(THEME_TOKEN_KEYS.slice(6)).toEqual([
            'success',
            'warning',
            'error',
            'info',
            'accentGradientTo',
        ])
    })
})

describe('encodeThemeCode', () => {
    /// Goal: the emitted code is the documented shape, one triple per token
    /// plus a checksum, so a hand-inspected code is readable.
    it('emits a prefixed body of one rgb triple per token, plus a crc', () => {
        const code = encodeThemeCode(tokens)
        expect(code.startsWith('cct2:')).toBe(true)
        expect(code.slice('cct2:'.length)).toHaveLength(THEME_TOKEN_KEYS.length * 6 + 2)
        expect(code).toMatch(/^cct2:[0-9a-f]+$/)
    })

    /// Goal: the accent leads the body, proving the wire order is the token
    /// order rather than object insertion order.
    it('writes tokens in THEME_TOKEN_KEYS order', () => {
        expect(encodeThemeCode(tokens).slice(5, 11)).toBe('bd93f9')
    })
})

describe('decodeThemeCode', () => {
    /// Goal: a code survives a round trip unchanged, which is the whole point
    /// of sharing one.
    it('round-trips every token', () => {
        expect(decodeThemeCode(encodeThemeCode(tokens))).toEqual(tokens)
    })

    /// Goal: codes retyped by hand without the checksum still work, as they
    /// did before the checksum existed.
    it('accepts a body with no checksum', () => {
        const code = encodeThemeCode(tokens)
        expect(decodeThemeCode(code.slice(0, -2))).toEqual(tokens)
    })

    /// Goal: a mistyped code is rejected rather than applied as wrong colors.
    it('rejects a body whose checksum does not match', () => {
        const code = encodeThemeCode(tokens)
        const corrupted = code.slice(0, 5) + 'ffffff' + code.slice(11)
        expect(decodeThemeCode(corrupted)).toBeNull()
    })

    /// Goal: cct1 codes shared before the status colors existed keep working,
    /// and report only what they actually carry so the caller can fill the
    /// rest from its own defaults.
    it('decodes a legacy cct1 code as a partial theme', () => {
        const body = ['bd93f9', '282a36', '343746', '44475a', 'f8f8f2', '8b9bd4'].join('')
        const decoded = decodeThemeCode('cct1:' + body)
        expect(decoded).toEqual({
            accent: '#bd93f9',
            bgOne: '#282a36',
            bgTwo: '#343746',
            borderOne: '#44475a',
            textColor: '#f8f8f2',
            textColorSecondary: '#8b9bd4',
        })
        expect(decoded).not.toHaveProperty('accentGradientTo')
    })

    /// Goal: junk in, null out, so the caller shows one clear error rather
    /// than applying a half-parsed theme.
    it('rejects malformed input', () => {
        expect(decodeThemeCode('')).toBeNull()
        expect(decodeThemeCode('nope')).toBeNull()
        expect(decodeThemeCode('cct2:')).toBeNull()
        expect(decodeThemeCode('cct2:zzz')).toBeNull()
        // A cct2 body that is one token short of the current format.
        expect(decodeThemeCode('cct2:' + 'ab'.repeat(30))).toBeNull()
    })

    /// Goal: codes are shareable as pasted, including with stray whitespace
    /// or uppercase from a chat client.
    it('normalizes case and surrounding whitespace', () => {
        const code = encodeThemeCode(tokens)
        expect(decodeThemeCode(`  ${code.toUpperCase()}  `)).toEqual(tokens)
    })
})
