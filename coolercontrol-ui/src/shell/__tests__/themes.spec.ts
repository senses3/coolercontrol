// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import {
    INSTALLED_THEMES,
    installedTheme,
    surfaceHoverFor,
    THEME_CSS_VAR_NAMES,
    themeCssVars,
    type ThemeTokens,
} from '../themes.ts'

const HEX = /^#[0-9a-f]{6}$/

const channel = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = (hex: string): number =>
    0.2126 * channel(Number.parseInt(hex.slice(1, 3), 16)) +
    0.7152 * channel(Number.parseInt(hex.slice(3, 5), 16)) +
    0.0722 * channel(Number.parseInt(hex.slice(5, 7), 16))
const contrast = (a: string, b: string): number => {
    const la = luminance(a)
    const lb = luminance(b)
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// WCAG's "clearly perceivable" line, the same bar used for large text and UI
// components. Full 4.5 body-text contrast is not reachable without distorting
// the upstream palettes, and the shipped dark theme's own error color sits at
// 4.15 against bg-two, so this is the honest floor to hold new themes to.
const MIN_CONTRAST = 3.0

/** Foreground tokens that land on bg-one or bg-two and so must stay readable. */
const FOREGROUND_KEYS = [
    'success',
    'warning',
    'error',
    'info',
    'accent',
    'textColor',
    'textColorSecondary',
] as const satisfies readonly (keyof ThemeTokens)[]

describe('installed themes', () => {
    /// Goal: every token is a real 6-digit hex, so a typo cannot silently parse
    /// as a different color. Method: match each token against the hex pattern.
    it('defines every token as a 6-digit hex color', () => {
        for (const theme of INSTALLED_THEMES) {
            for (const [key, value] of Object.entries(theme.tokens)) {
                expect(value, `${theme.id}.${key}`).toMatch(HEX)
            }
        }
    })

    /// Goal: ids are unique, since the id is what gets persisted as the theme mode.
    it('has unique ids', () => {
        const ids = INSTALLED_THEMES.map((theme) => theme.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    /// Goal: no theme repeats the washed-out status colors that made warnings
    /// invisible on light backgrounds. Method: check every foreground token
    /// against both surfaces it can be drawn on.
    it('keeps every foreground readable on both surfaces', () => {
        for (const theme of INSTALLED_THEMES) {
            for (const key of FOREGROUND_KEYS) {
                const color = theme.tokens[key]
                for (const surface of ['bgOne', 'bgTwo'] as const) {
                    const ratio = contrast(color, theme.tokens[surface])
                    expect(
                        ratio,
                        `${theme.id} ${key} on ${surface} is ${ratio.toFixed(2)}:1`,
                    ).toBeGreaterThanOrEqual(MIN_CONTRAST)
                }
            }
        }
    })

    /// Goal: the brand gradient stays visible wherever it is drawn. Its far end
    /// only ever paints a rail indicator, a pill border and a small dot, so it
    /// is held to the same non-text bar as the other foregrounds rather than to
    /// body-text contrast. A theme opts out by setting it equal to the accent,
    /// which the accent's own check already covers.
    it('keeps the gradient end visible on both surfaces', () => {
        for (const theme of INSTALLED_THEMES) {
            const { accent, accentGradientTo } = theme.tokens
            if (accentGradientTo === accent) continue
            for (const surface of ['bgOne', 'bgTwo'] as const) {
                const ratio = contrast(accentGradientTo, theme.tokens[surface])
                expect(
                    ratio,
                    `${theme.id} accentGradientTo on ${surface} is ${ratio.toFixed(2)}:1`,
                ).toBeGreaterThanOrEqual(MIN_CONTRAST)
            }
        }
    })

    /// Goal: cards stay visually distinct from the page behind them. Method:
    /// assert the two surfaces are not the same color.
    it('separates the two surfaces', () => {
        for (const theme of INSTALLED_THEMES) {
            expect(theme.tokens.bgTwo, theme.id).not.toBe(theme.tokens.bgOne)
        }
    })

    /// Goal: the hover tint matches the theme's brightness, so a light theme
    /// darkens on hover instead of washing out.
    it('derives the hover tint from the variant', () => {
        for (const theme of INSTALLED_THEMES) {
            const expected = theme.variant === 'dark' ? '255 255 255' : '0 0 0'
            expect(surfaceHoverFor(theme), theme.id).toBe(expected)
        }
    })

    /// Goal: themes are applied as the `r g b` triplets the variables carry, not
    /// hex, or every utility resolves to an invalid color. Method: convert a
    /// known theme and check the variable list.
    it('emits rgb triplets for every variable', () => {
        const vars = new Map(themeCssVars(installedTheme('dracula')!))
        expect(vars.get('--colors-accent')).toBe('189 147 249')
        expect(vars.get('--colors-bg-one')).toBe('40 42 54')
        expect(vars.get('--colors-surface-hover')).toBe('255 255 255')
        expect(vars.size).toBe(THEME_CSS_VAR_NAMES.length)
        for (const value of vars.values()) {
            expect(value).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/)
        }
    })

    /// Goal: lookup by id resolves, and an unknown id does not.
    it('looks themes up by id', () => {
        expect(installedTheme('dracula')?.name).toBe('Dracula')
        expect(installedTheme('not-a-theme')).toBeUndefined()
    })
})
