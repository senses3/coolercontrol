// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Installed color themes.
 *
 * Each theme carries the tokens a theme is allowed to define. The palette
 * hues (pink/green/red/yellow/blue/white) are deliberately NOT themed: they only
 * tint tag backgrounds and stay global.
 *
 * Themes are applied as inline `--colors-*` variables rather than compiled
 * tailwind themes, so adding one is a single entry here. `surface-hover` and the
 * accent/error foregrounds are derived, not stored.
 *
 * Values follow each project's published palette. Where an upstream status color
 * was too close to its own background to read, it is nudged within its hue until
 * it clears the floor in `themes.spec.ts`; those are marked `nudged from`.
 */

/** The tokens a theme defines. Everything else is derived or global. */
export interface ThemeTokens {
    accent: string
    /** Far end of the brand gradient. Equal to `accent` means no gradient. */
    accentGradientTo: string
    bgOne: string
    bgTwo: string
    borderOne: string
    textColor: string
    textColorSecondary: string
    success: string
    warning: string
    error: string
    info: string
}

export interface InstalledTheme {
    /** Stable id; persisted as the UI's theme mode. */
    id: string
    /** Display name. A proper noun, so it is never translated. */
    name: string
    /** Drives the derived surface-hover tint and the OS color-scheme hint. */
    variant: 'dark' | 'light'
    tokens: ThemeTokens
}

export const INSTALLED_THEMES: InstalledTheme[] = [
    {
        id: 'true-black',
        name: 'True Black',
        variant: 'dark',
        tokens: {
            accent: '#4d8cff',
            accentGradientTo: '#ff21ff', // CoolerControl logo magenta
            bgOne: '#000000',
            bgTwo: '#121212',
            borderOne: '#2e2e2e',
            textColor: '#e6e6e6',
            textColorSecondary: '#9a9a9a',
            success: '#3ddc84',
            warning: '#ffc14d',
            error: '#ff6b6b',
            info: '#4da3ff',
        },
    },
    {
        id: 'dracula',
        name: 'Dracula',
        variant: 'dark',
        tokens: {
            accent: '#bd93f9',
            accentGradientTo: '#ff79c6', // Dracula pink
            bgOne: '#282a36',
            bgTwo: '#343746',
            borderOne: '#44475a',
            textColor: '#f8f8f2',
            textColorSecondary: '#8b9bd4',
            success: '#50fa7b',
            warning: '#f1fa8c',
            error: '#ff5555',
            info: '#8be9fd',
        },
    },
    {
        id: 'gruvbox-dark',
        name: 'Gruvbox Dark',
        variant: 'dark',
        tokens: {
            accent: '#83a598',
            accentGradientTo: '#d3869b', // Gruvbox bright purple
            bgOne: '#282828',
            bgTwo: '#3c3836',
            borderOne: '#504945',
            textColor: '#ebdbb2',
            textColorSecondary: '#a89984',
            success: '#b8bb26',
            warning: '#fabd2f',
            error: '#fb4934',
            info: '#83a598',
        },
    },
    {
        id: 'gruvbox-light',
        name: 'Gruvbox Light',
        variant: 'light',
        tokens: {
            accent: '#076678',
            accentGradientTo: '#8f3f71', // Gruvbox faded purple
            bgOne: '#fbf1c7',
            bgTwo: '#ebdbb2',
            borderOne: '#d5c4a1',
            textColor: '#3c3836',
            textColorSecondary: '#7c6f64',
            success: '#79740e',
            warning: '#8f5f0a', // nudged from #b57614
            error: '#9d0006',
            info: '#076678',
        },
    },
    {
        id: 'one-dark',
        name: 'One Dark',
        variant: 'dark',
        tokens: {
            accent: '#61afef',
            accentGradientTo: '#c678dd', // One Dark purple
            bgOne: '#282c34',
            bgTwo: '#31363f',
            borderOne: '#3e4451',
            textColor: '#abb2bf',
            textColorSecondary: '#8b92a0',
            success: '#98c379',
            warning: '#e5c07b',
            error: '#e06c75',
            info: '#56b6c2',
        },
    },
    {
        id: 'one-light',
        name: 'One Light',
        variant: 'light',
        tokens: {
            accent: '#4078f2',
            accentGradientTo: '#a626a4', // One Light magenta
            bgOne: '#fafafa',
            bgTwo: '#eaeaeb',
            borderOne: '#d3d3d4',
            textColor: '#383a42',
            textColorSecondary: '#696c77',
            success: '#3f7f3e', // nudged from #50a14f
            warning: '#9a6700', // nudged from #c18401
            error: '#ca1243',
            info: '#0184bc',
        },
    },
    {
        id: 'catppuccin-mocha',
        name: 'Catppuccin Mocha',
        variant: 'dark',
        tokens: {
            accent: '#cba6f7',
            accentGradientTo: '#f5c2e7', // Catppuccin Pink
            bgOne: '#1e1e2e',
            bgTwo: '#313244',
            borderOne: '#45475a',
            textColor: '#cdd6f4',
            textColorSecondary: '#a6adc8',
            success: '#a6e3a1',
            warning: '#f9e2af',
            error: '#f38ba8',
            info: '#89b4fa',
        },
    },
    {
        id: 'catppuccin-latte',
        name: 'Catppuccin Latte',
        variant: 'light',
        tokens: {
            accent: '#8839ef',
            accentGradientTo: '#c95aab', // Catppuccin Pink, nudged from #ea76cb
            bgOne: '#eff1f5',
            bgTwo: '#e6e9ef',
            borderOne: '#ccd0da',
            textColor: '#4c4f69',
            textColorSecondary: '#6c6f85',
            success: '#2f7d20', // nudged from #40a02b
            warning: '#9d6510', // nudged from #df8e1d
            error: '#d20f39',
            info: '#1e66f5',
        },
    },
    {
        id: 'tokyo-night',
        name: 'Tokyo Night',
        variant: 'dark',
        tokens: {
            accent: '#7aa2f7',
            accentGradientTo: '#bb9af7', // Tokyo Night purple
            bgOne: '#1a1b26',
            bgTwo: '#24283b',
            borderOne: '#3b4261',
            textColor: '#c0caf5',
            textColorSecondary: '#9aa5ce',
            success: '#9ece6a',
            warning: '#e0af68',
            error: '#f7768e',
            info: '#7dcfff',
        },
    },
    {
        id: 'tokyo-night-day',
        name: 'Tokyo Night Day',
        variant: 'light',
        tokens: {
            accent: '#1e63c8', // nudged from #2e7de9
            accentGradientTo: '#8a46e0', // Tokyo Night purple, nudged from #9854f1
            bgOne: '#e1e2e7',
            bgTwo: '#d4d6e0',
            borderOne: '#a8aecb',
            textColor: '#343b58',
            textColorSecondary: '#5a638c',
            success: '#587539',
            warning: '#8c6c3e',
            error: '#c64343',
            info: '#1e63c8', // nudged from #2e7de9
        },
    },
    {
        id: 'monokai',
        name: 'Monokai',
        variant: 'dark',
        tokens: {
            accent: '#66d9ef',
            accentGradientTo: '#ae81ff', // Monokai purple
            bgOne: '#272822',
            bgTwo: '#32332c',
            borderOne: '#49483e',
            textColor: '#f8f8f2',
            textColorSecondary: '#a59f85',
            success: '#a6e22e',
            warning: '#e6db74',
            error: '#f92672',
            info: '#66d9ef',
        },
    },
    {
        id: 'nord',
        name: 'Nord',
        variant: 'dark',
        tokens: {
            accent: '#88c0d0',
            accentGradientTo: '#b48ead', // Nord aurora purple
            bgOne: '#2e3440',
            bgTwo: '#3b4252',
            borderOne: '#4c566a',
            textColor: '#eceff4',
            textColorSecondary: '#aebacf',
            success: '#a3be8c',
            warning: '#ebcb8b',
            error: '#d08a92', // nudged from #bf616a
            info: '#88c0d0',
        },
    },
    {
        id: 'solarized-dark',
        name: 'Solarized Dark',
        variant: 'dark',
        tokens: {
            accent: '#268bd2',
            accentGradientTo: '#7479ce', // Solarized violet, nudged from #6c71c4
            bgOne: '#002b36',
            bgTwo: '#073642',
            borderOne: '#586e75',
            textColor: '#93a1a1',
            textColorSecondary: '#7b8f8f',
            success: '#859900',
            warning: '#b58900',
            error: '#ea5c58', // nudged from #dc322f
            info: '#2aa198',
        },
    },
    {
        id: 'solarized-light',
        name: 'Solarized Light',
        variant: 'light',
        tokens: {
            accent: '#1c6a9e', // nudged from #268bd2
            accentGradientTo: '#6c71c4', // Solarized violet
            bgOne: '#fdf6e3',
            bgTwo: '#eee8d5',
            borderOne: '#c9c2ab',
            textColor: '#586e75',
            textColorSecondary: '#657b83',
            success: '#6b7c00', // nudged from #859900
            warning: '#96710a', // nudged from #b58900
            error: '#dc322f',
            info: '#218a82', // nudged from #2aa198
        },
    },
    {
        // No upstream project to follow: a green phosphor terminal, built here.
        // Kept off pure black so it reads as a CRT rather than True Black tinted
        // green, and the text green is pulled well back from the accent so a
        // whole page of it is not the same shout as a highlight.
        id: 'hackerman',
        name: 'Hackerman',
        variant: 'dark',
        tokens: {
            accent: '#00ff41',
            accentGradientTo: '#00e5ff', // terminal cyan
            bgOne: '#020a02',
            bgTwo: '#0b160b',
            borderOne: '#1c3a1c',
            textColor: '#b8ffc8',
            textColorSecondary: '#5fbf6f',
            success: '#00ff41',
            warning: '#ffd700',
            error: '#ff5f5f',
            info: '#00e5ff',
        },
    },
    {
        // No upstream project to follow either: a muted slate palette for people
        // who want the UI to sit still. Every foreground is desaturated on
        // purpose, so the status colors carry their meaning by hue alone and
        // nothing on the page competes with the live readings.
        id: 'solitude',
        name: 'Solitude',
        variant: 'dark',
        tokens: {
            accent: '#8fa3d9',
            accentGradientTo: '#b99ad4', // muted mauve
            bgOne: '#1c1f26',
            bgTwo: '#252932',
            borderOne: '#363b47',
            textColor: '#d5d8e0',
            textColorSecondary: '#8b93a7',
            success: '#8fbf9f',
            warning: '#d9bc8c',
            error: '#d98a8a',
            info: '#8fb8d9',
        },
    },
]

const THEMES_BY_ID = new Map(INSTALLED_THEMES.map((theme) => [theme.id, theme]))

export const installedTheme = (id: string): InstalledTheme | undefined => THEMES_BY_ID.get(id)

/**
 * Hover tint. A dark theme lifts the surface with white, a light theme deepens
 * it with black, matching what the compiled themes do. Only the tint color is a
 * variable: tailwind bakes the 0.05 alpha into the utility at build time.
 */
export const surfaceHoverFor = (theme: InstalledTheme): string =>
    theme.variant === 'dark' ? '255 255 255' : '0 0 0'

/** `#rrggbb` to the `r g b` triplet the `--colors-*` variables carry. */
export const hexToTriplet = (hex: string): string =>
    [
        Number.parseInt(hex.slice(1, 3), 16),
        Number.parseInt(hex.slice(3, 5), 16),
        Number.parseInt(hex.slice(5, 7), 16),
    ].join(' ')

/**
 * The variable each token drives. Custom themes carry the same keys, so both
 * paths apply a theme through this one map.
 *
 * This order is the theme-code wire order (see `shell/themeCode.ts`): a `cct1`
 * code holds the first six entries. Append new tokens, never insert, or every
 * shared code decodes into the wrong colors. `themeCode.spec.ts` locks it.
 */
export const THEME_TOKEN_VARS: Record<keyof ThemeTokens, string> = {
    accent: '--colors-accent',
    bgOne: '--colors-bg-one',
    bgTwo: '--colors-bg-two',
    borderOne: '--colors-border-one',
    textColor: '--colors-text-color',
    textColorSecondary: '--colors-text-color-secondary',
    success: '--colors-success',
    warning: '--colors-warning',
    error: '--colors-error',
    info: '--colors-info',
    accentGradientTo: '--colors-accent-gradient-to',
}

export const THEME_TOKEN_KEYS = Object.keys(THEME_TOKEN_VARS) as Array<keyof ThemeTokens>

/** Every `--colors-*` variable an installed theme sets, including the derived hover tint. */
export const themeCssVars = (theme: InstalledTheme): Array<[string, string]> => [
    ...THEME_TOKEN_KEYS.map((token): [string, string] => [
        THEME_TOKEN_VARS[token],
        hexToTriplet(theme.tokens[token]),
    ]),
    ['--colors-surface-hover', surfaceHoverFor(theme)],
]

/** The variables a theme switch has to clear before the next theme is applied. */
export const THEME_CSS_VAR_NAMES: string[] = [
    ...Object.values(THEME_TOKEN_VARS),
    '--colors-surface-hover',
]

/**
 * The hover tint for an arbitrary background, used by custom themes where the
 * variant is not declared: a light background darkens, a dark one lightens.
 * Accepts either `#rrggbb` or the `r g b` form the settings store holds.
 */
export const surfaceTintFor = (background: string): string => {
    const [r, g, b] = background.startsWith('#')
        ? [1, 3, 5].map((at) => Number.parseInt(background.slice(at, at + 2), 16))
        : background.split(/[\s,]+/).map((part) => Number.parseInt(part, 10))
    const channel = (c: number): number => {
        const s = (Number.isFinite(c) ? c : 0) / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    return luminance > 0.4 ? '0 0 0' : '255 255 255'
}

/** The four colors a picker preview shows: page, card, accent, text. */
export type ThemeSwatch = [string, string, string, string]

export const swatchFor = (theme: InstalledTheme): ThemeSwatch => [
    theme.tokens.bgOne,
    theme.tokens.bgTwo,
    theme.tokens.accent,
    theme.tokens.textColor,
]

/**
 * The same preview for a compiled theme, read back from its own class rather
 * than duplicated here, so the picker cannot drift from tailwind.config.js.
 */
export const probeCompiledSwatch = (className: string): ThemeSwatch => {
    const probe = document.createElement('div')
    probe.className = className
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none'
    document.body.appendChild(probe)
    const style = getComputedStyle(probe)
    const read = (name: string): string => `rgb(${style.getPropertyValue(name).trim()})`
    const swatch: ThemeSwatch = [
        read('--colors-bg-one'),
        read('--colors-bg-two'),
        read('--colors-accent'),
        read('--colors-text-color'),
    ]
    probe.remove()
    return swatch
}
