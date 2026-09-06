// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

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

    /// Goal: body length is enforced by explicit comparison rather than by a count
    /// inside the pattern, so an off-by-one body must still be rejected. Method:
    /// take a valid body and add or drop a single character.
    it('rejects a body one character off the expected length', () => {
        const body = encodeThemeCode(tokens).slice('cct2:'.length, -2)
        expect(decodeThemeCode('cct2:' + body + 'a')).toBeNull()
        expect(decodeThemeCode('cct2:' + body.slice(0, -1))).toBeNull()
    })

    /// Goal: a body of exactly the right length but outside the hex alphabet is
    /// rejected, which is the half of the check the pattern still owns. Method:
    /// swap one character of a valid body for a non-hex one, with and without the
    /// checksum suffix present.
    it('rejects a full-length body holding a non-hex character', () => {
        const code = encodeThemeCode(tokens)
        const body = code.slice('cct2:'.length, -2)
        expect(decodeThemeCode('cct2:' + body.slice(0, -1) + 'g')).toBeNull()
        expect(decodeThemeCode('cct2:' + body.slice(0, -1) + 'g' + code.slice(-2))).toBeNull()
    })

    /// Goal: codes are shareable as pasted, including with stray whitespace
    /// or uppercase from a chat client.
    it('normalizes case and surrounding whitespace', () => {
        const code = encodeThemeCode(tokens)
        expect(decodeThemeCode(`  ${code.toUpperCase()}  `)).toEqual(tokens)
    })
})
