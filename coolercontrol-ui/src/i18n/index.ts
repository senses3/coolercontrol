// SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { createI18n } from 'vue-i18n'
import en from './locales/en.ts'
import zh from './locales/zh.ts'
import ja from './locales/ja.ts'
import zhTw from './locales/zh-tw.ts'
import ru from './locales/ru.ts'
import de from './locales/de.ts'
import fr from './locales/fr.ts'
import es from './locales/es.ts'
import ar from './locales/ar.ts'
import pt from './locales/pt.ts'
import hi from './locales/hi.ts'
import ko from './locales/ko.ts'

// The cached setting stands in until the daemon's copy arrives with the rest
// of the UI settings, which is well after this instance has to exist.
import { readCachedLanguage, resolveLanguage } from './locale.ts'

const savedLocale = resolveLanguage(readCachedLanguage())

const i18n = createI18n({
    legacy: false, // Use Composition API
    locale: savedLocale,
    fallbackLocale: 'en',
    messages: {
        en,
        zh,
        'zh-tw': zhTw,
        ja,
        ru,
        de,
        fr,
        es,
        ar,
        pt,
        hi,
        ko,
    },
    silentTranslationWarn: true,
    silentFallbackWarn: true,
    warnHtmlMessage: false, // Disable warnings for HTML content in messages
    // Add additional options to ensure internationalization works properly
    sync: true,
    globalInjection: true,
})

console.debug('i18n instance created:', {
    currentLanguage: i18n.global.locale,
    availableMessages: Object.keys(i18n.global.messages),
})

export default i18n
