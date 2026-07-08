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

import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * This store offers programmatic access to our color themes.
 */
export const useThemeColorsStore = defineStore('theme-colors', () => {
    const cssRoot = document.querySelector(':root')
    const getStyle = (varName: string): string =>
        `rgb(${getComputedStyle(cssRoot!).getPropertyValue(varName)})`

    // Contrast-aware foreground for filled surfaces (accent / error buttons):
    // pick whichever theme text color reads best on the surface, falling back to
    // pure white/black when neither clears WCAG AA. Recomputed on every theme
    // change (incl. the system theme's unknown OS accent) and exposed as the
    // --colors-accent-fg / --colors-error-fg CSS variables.
    const rawVar = (name: string): string =>
        getComputedStyle(cssRoot!).getPropertyValue(name).trim()
    const parseRgb = (value: string): number[] =>
        value.split(/[\s,]+/).map((n) => Number.parseInt(n, 10))
    const relLuminance = ([r, g, b]: number[]): number => {
        const channel = (c: number): number => {
            const s = c / 255
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
    const contrastRatio = (a: number[], b: number[]): number => {
        const la = relLuminance(a)
        const lb = relLuminance(b)
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
    }
    const bestForeground = (bg: number[]): number[] => {
        const text = parseRgb(rawVar('--colors-text-color'))
        const base = parseRgb(rawVar('--colors-bg-one'))
        if (Math.max(contrastRatio(bg, text), contrastRatio(bg, base)) >= 4.5) {
            return contrastRatio(bg, text) >= contrastRatio(bg, base) ? text : base
        }
        return contrastRatio(bg, [255, 255, 255]) >= contrastRatio(bg, [0, 0, 0])
            ? [255, 255, 255]
            : [0, 0, 0]
    }
    const applyContrastVars = (): void => {
        document.documentElement.style.setProperty(
            '--colors-accent-fg',
            bestForeground(parseRgb(rawVar('--colors-accent'))).join(' '),
        )
        document.documentElement.style.setProperty(
            '--colors-error-fg',
            bestForeground(parseRgb(rawVar('--colors-error'))).join(' '),
        )
        // Match native controls (date picker popup + icon, scrollbars) to the
        // theme's brightness so they don't render light-on-dark.
        document.documentElement.style.colorScheme =
            relLuminance(parseRgb(rawVar('--colors-bg-one'))) > 0.4 ? 'light' : 'dark'
    }

    const reLoadThemeColors = () => {
        themeColors.value.accent = getStyle('--colors-accent')
        themeColors.value.bg_one = getStyle('--colors-bg-one')
        themeColors.value.bg_two = getStyle('--colors-bg-two')
        themeColors.value.border = getStyle('--colors-border-one')
        themeColors.value.text_color = getStyle('--colors-text-color')
        themeColors.value.text_color_secondary = getStyle('--colors-text-color-secondary')
        applyContrastVars()
    }

    // Theme-mode switches toggle a class on <html>; watch it so the contrast
    // foregrounds recompute even when reLoadThemeColors isn't called explicitly.
    applyContrastVars()
    new MutationObserver(applyContrastVars).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
    })

    const themeColors = ref({
        accent: getStyle('--colors-accent'),
        bg_one: getStyle('--colors-bg-one'),
        bg_two: getStyle('--colors-bg-two'),
        border: getStyle('--colors-border-one'),
        text_color: getStyle('--colors-text-color'),
        text_color_secondary: getStyle('--colors-text-color-secondary'),
        white: getStyle('--colors-white'),
        pink: getStyle('--colors-pink'),
        green: getStyle('--colors-success'),
        red: getStyle('--colors-error'),
        yellow: getStyle('--colors-warning'),
        info: getStyle('--colors-info'),
    })

    function hexToRgb(hex: string): Array<number> {
        return hex
            .replace(
                /^#?([a-f\d])([a-f\d])([a-f\d])$/i,
                (_m, r, g, b) => '#' + r + r + g + g + b + b,
            )!
            .substring(1)
            .match(/.{2}/g)!
            .map((x) => parseInt(x, 16))
    }

    function hexToRgbThemeString(hex: string): string {
        const [r, g, b] = hexToRgb(hex)
        return `${r} ${g} ${b}`
    }

    function hexToRgbString(hex: string): string {
        if (isRGBColor(hex)) {
            return hex
        }
        return `rgb(${hexToRgb(hex).join(', ')})`
    }

    function rgbToHex(rgb: string): string {
        if (isHexColor(rgb)) {
            return rgb
        }
        const matches = rgb.match(/\d+/g)!.map((x) => parseInt(x, 10))
        if (matches == null) {
            console.error(`Invalid RGB color: ${rgb}`)
            return rgb
        }
        const [r, g, b] = matches
        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
    }

    function isHexColor(color: string): boolean {
        return color.startsWith('#')
    }

    function isValidHex(color: string): boolean {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)
    }

    function isRGBColor(color: string): boolean {
        return color.startsWith('rgb')
    }

    // function isValidRGB(color: string): boolean {
    //     return /^rgb\((\d{1,3},){2}\d{1,3}\)$/.test(color)
    // }

    function convertColorToRGBA(color: string, opacity: number): string {
        if (color.includes('#')) {
            const rgbArray = hexToRgb(color)
            return `rgba(${rgbArray[0]}, ${rgbArray[1]}, ${rgbArray[2]}, ${opacity})`
        } else if (color.includes(',')) {
            return color.replace(')', `, ${opacity})`).replace('rgb', 'rgba')
        } else {
            return color.replace(')', ` / ${opacity})`).replace('rgb', 'rgba')
        }
    }

    console.debug(`Theme Colors Store created`)
    return {
        themeColors,
        reLoadThemeColors,
        hexToRgb,
        hexToRgbString,
        hexToRgbThemeString,
        rgbToHex,
        isHexColor,
        isValidHex,
        convertColorToRGBA,
    }
})
