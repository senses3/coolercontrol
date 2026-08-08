// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useThemeColorsStore } from '../ThemeColorsStore.ts'

describe('rgbToHex', () => {
    beforeEach(() => setActivePinia(createPinia()))

    it('converts an rgb string to hex', () => {
        expect(useThemeColorsStore().rgbToHex('rgb(86, 138, 242)')).toBe('#568af2')
    })

    it('passes hex colors through unchanged', () => {
        expect(useThemeColorsStore().rgbToHex('#568af2')).toBe('#568af2')
    })

    // A sensor listed by the Monitoring panel but missing a color settings entry
    // yields an empty string. This must not throw: previously the null match was
    // dereferenced before the guard and blanked every Dashboard.
    it('returns an empty string unchanged instead of throwing', () => {
        expect(() => useThemeColorsStore().rgbToHex('')).not.toThrow()
        expect(useThemeColorsStore().rgbToHex('')).toBe('')
    })

    it('returns unparseable input unchanged instead of throwing', () => {
        expect(() => useThemeColorsStore().rgbToHex('not-a-color')).not.toThrow()
        expect(useThemeColorsStore().rgbToHex('not-a-color')).toBe('not-a-color')
    })
})
