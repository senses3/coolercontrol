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
