// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// The language setting holds an intent, not a resolved code. `system` means
// follow the locale the browser reports, which both a browser and the Qt app
// take from the OS. Storing the intent is what lets one choice travel to a
// machine whose system language differs, and it keeps "never chose" tellable
// apart from "chose German", which a resolved code cannot express.
export const SYSTEM_LANGUAGE = 'system'

// The locales this UI ships messages for. Anything else, including a code left
// by an older version that has since been dropped, resolves by detection rather
// than being handed to i18n to fall back key by key.
export const APP_LOCALES = [
    'en',
    'zh',
    'zh-tw',
    'ja',
    'ru',
    'de',
    'fr',
    'es',
    'ar',
    'pt',
    'ko',
    'hi',
] as const
export type AppLocale = (typeof APP_LOCALES)[number]

const isAppLocale = (value: string): value is AppLocale =>
    (APP_LOCALES as readonly string[]).includes(value)

// Browser tags this UI can serve. Region variants that need a specific locale
// are listed; everything else falls back to its language prefix.
const BROWSER_LANGUAGES: Record<string, AppLocale> = {
    zh: 'zh',
    'zh-cn': 'zh',
    'zh-tw': 'zh-tw',
    'zh-hk': 'zh-tw',
    ja: 'ja',
    ru: 'ru',
    de: 'de',
    fr: 'fr',
    es: 'es',
    ar: 'ar',
    pt: 'pt',
    'pt-br': 'pt',
    ko: 'ko',
    hi: 'hi',
}

// Mirrors the daemon-held setting so the first paint is in the right language:
// the i18n instance is built at module load, long before the settings request
// returns. The daemon is the source of truth; this is only a cache, and the
// key is the one older versions wrote so their value migrates on first run.
const CACHE_KEY = 'locale'

export const detectSystemLanguage = (): AppLocale => {
    const tag = navigator.language.toLowerCase()
    return BROWSER_LANGUAGES[tag] ?? BROWSER_LANGUAGES[tag.split('-')[0]] ?? 'en'
}

// SYSTEM_LANGUAGE is not an app locale, so it detects along with everything
// else this build cannot serve.
export const resolveLanguage = (setting: string | undefined): AppLocale =>
    setting != null && isAppLocale(setting) ? setting : detectSystemLanguage()

export const readCachedLanguage = (): string | undefined =>
    localStorage.getItem(CACHE_KEY) ?? undefined

// Where the setting comes from, in order of authority. The cache lookup is the
// migration path: versions before the daemon held this wrote only localStorage,
// so their value is the one record that a choice was ever made.
export const languageSetting = (persisted: string | undefined): string =>
    persisted ?? readCachedLanguage() ?? SYSTEM_LANGUAGE

export const cacheLanguage = (setting: string): void => {
    localStorage.setItem(CACHE_KEY, setting)
}
