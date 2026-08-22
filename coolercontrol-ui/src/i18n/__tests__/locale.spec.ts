// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// The language setting is stored as an intent, and this is where that intent
// turns back into a locale. The rule that matters: a setting of `system` must
// keep resolving from the browser every time, because storing the resolved
// code instead is what let a German system silently overwrite a deliberate
// choice whenever browser storage went away.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    detectSystemLanguage,
    languageSetting,
    resolveLanguage,
    SYSTEM_LANGUAGE,
} from '../locale.ts'

const setBrowserLanguage = (tag: string): void => {
    Object.defineProperty(navigator, 'language', { value: tag, configurable: true })
}

beforeEach(() => {
    localStorage.clear()
    setBrowserLanguage('en-US')
})
afterEach(() => localStorage.clear())

describe('detectSystemLanguage', () => {
    it('takes the region variant when one is shipped', () => {
        setBrowserLanguage('zh-HK')
        expect(detectSystemLanguage()).toBe('zh-tw')
    })

    it('falls back to the language prefix', () => {
        setBrowserLanguage('de-AT')
        expect(detectSystemLanguage()).toBe('de')
    })

    it('falls back to english for a language this build has no messages for', () => {
        setBrowserLanguage('sv-SE')
        expect(detectSystemLanguage()).toBe('en')
    })
})

describe('resolveLanguage', () => {
    it('follows the browser when the setting is system', () => {
        setBrowserLanguage('de-DE')
        expect(resolveLanguage(SYSTEM_LANGUAGE)).toBe('de')
    })

    // The whole point of the setting: an explicit choice outranks the system.
    it('keeps an explicit choice on a system with a different locale', () => {
        setBrowserLanguage('de-DE')
        expect(resolveLanguage('en')).toBe('en')
    })

    it('detects when nothing is stored', () => {
        setBrowserLanguage('fr-FR')
        expect(resolveLanguage(undefined)).toBe('fr')
    })

    // A code from a build that shipped a locale this one does not, or junk.
    it('detects rather than handing i18n a locale it cannot serve', () => {
        setBrowserLanguage('de-DE')
        expect(resolveLanguage('sv')).toBe('de')
    })
})

describe('languageSetting', () => {
    it('prefers the daemon copy', () => {
        localStorage.setItem('locale', 'fr')
        expect(languageSetting('en')).toBe('en')
    })

    // Migration: versions before the daemon held this wrote only localStorage.
    it('adopts a pre-daemon localStorage value', () => {
        localStorage.setItem('locale', 'fr')
        expect(languageSetting(undefined)).toBe('fr')
    })

    // A first run with nothing stored anywhere follows the system, and stores
    // that intent rather than the language it happens to resolve to today.
    it('defaults to following the system', () => {
        expect(languageSetting(undefined)).toBe(SYSTEM_LANGUAGE)
    })
})
