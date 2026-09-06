// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// The catalogs are hand-authored, so the only thing keeping them honest is this
// file. The settings check runs in both directions: a new row without an id, or
// an id without a catalog entry, fails here rather than silently dropping out
// of search months later.

import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en.ts'
import { ACTION_ENTRIES, ACTION_IDS } from '../actionCatalog.ts'
import { PAGE_ENTRIES, PAGE_GROUPS } from '../pages.ts'
import { SETTINGS_ENTRIES } from '../settingsCatalog.ts'
import { KIND_LABEL_KEYS, SEARCH_KINDS } from '../types.ts'

const localeFiles = import.meta.glob('../../../i18n/locales/*.ts', { eager: true }) as Record<
    string,
    { default: any }
>
const LOCALE_COUNT = 12

// Read as source rather than imported: the router module pulls in ShellLayout,
// which touches window.matchMedia at module scope. The names are literals in
// that file, so the source is as good a check and has no side effects.
const routerSource = Object.values(
    import.meta.glob('../../../router/index.ts', {
        query: '?raw',
        import: 'default',
        eager: true,
    }) as Record<string, string>,
)[0]

const appSettings = Object.values(
    import.meta.glob('../../../layout/AppSettings.vue', {
        query: '?raw',
        import: 'default',
        eager: true,
    }) as Record<string, string>,
)[0]

function resolves(root: any, key: string): boolean {
    let node: any = root
    for (const part of key.split('.')) {
        node = node?.[part]
        if (node == null) return false
    }
    return typeof node === 'string'
}

const locales = (): Array<[string, any]> =>
    Object.entries(localeFiles)
        .filter(([path]) => !path.endsWith('.d.ts'))
        .map(([path, module]) => [path, module.default])

describe('settings catalog', () => {
    it('reads AppSettings.vue', () => {
        expect(appSettings).toBeTypeOf('string')
        expect(appSettings).toContain('<UiSettingRow')
    })

    it('gives every settings row an id', () => {
        const rows = [...appSettings.matchAll(/<UiSettingRow\b([^>]*)>/g)]
        expect(rows.length).toBeGreaterThan(20)
        const missing = rows
            .map((match) => match[1])
            .filter((attrs) => !/\bid="|\B:id="/.test(attrs))
        expect(missing).toEqual([])
    })

    // Static ids are rows the palette can name. The one dynamic `:id` belongs to
    // the Custom Theme v-for, which is indexed once as a page instead.
    it('has a catalog entry for every static row id', () => {
        const ids = [...appSettings.matchAll(/<UiSettingRow\b[^>]*?\sid="([^"]+)"/g)].map(
            (match) => match[1],
        )
        const known = new Set(SETTINGS_ENTRIES.map((entry) => entry.id))
        expect(ids.length).toBeGreaterThan(20)
        expect(ids.filter((id) => !known.has(id))).toEqual([])
    })

    it('points every catalog entry at a row that exists', () => {
        const orphans = SETTINGS_ENTRIES.filter(
            (entry) => !appSettings.includes(`id="${entry.id}"`),
        )
        expect(orphans.map((entry) => entry.id)).toEqual([])
    })

    it('has no duplicate ids', () => {
        const ids = SETTINGS_ENTRIES.map((entry) => entry.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('resolves every label, card and group key in english', () => {
        const missing: string[] = []
        for (const entry of SETTINGS_ENTRIES) {
            for (const key of [entry.labelKey, entry.cardKey, entry.groupKey]) {
                if (key != null && !resolves(en, key)) missing.push(`${entry.id}: ${key}`)
            }
        }
        expect(missing).toEqual([])
    })

    it('wires each entry to the label AppSettings actually renders', () => {
        const wrong = SETTINGS_ENTRIES.filter(
            (entry) => !appSettings.includes(`'${entry.labelKey}'`),
        )
        expect(wrong.map((entry) => entry.id)).toEqual([])
    })
})

describe('action catalog', () => {
    it('covers every declared action id exactly once', () => {
        expect(ACTION_ENTRIES.map((entry) => entry.id).sort()).toEqual([...ACTION_IDS].sort())
    })

    it('resolves every label and breadcrumb key in english', () => {
        const missing: string[] = []
        for (const entry of ACTION_ENTRIES) {
            for (const key of [entry.labelKey, ...entry.breadcrumbKeys]) {
                if (!resolves(en, key)) missing.push(`${entry.id}: ${key}`)
            }
        }
        expect(missing).toEqual([])
    })

    // Reused keys only. An action that needed a new string would show up here.
    it('resolves every action label in every locale', () => {
        const found = locales()
        expect(found).toHaveLength(LOCALE_COUNT)
        const missing: string[] = []
        for (const [path, messages] of found) {
            for (const entry of ACTION_ENTRIES) {
                if (!resolves(messages, entry.labelKey)) missing.push(`${path}: ${entry.labelKey}`)
            }
        }
        expect(missing).toEqual([])
    })
})

describe('page catalog', () => {
    const routeNames = new Set(
        [...routerSource.matchAll(/\bname: '([a-z0-9-]+)'/g)].map((match) => match[1]),
    )

    it('reads the router source', () => {
        expect(routeNames.size).toBeGreaterThan(15)
    })

    it('points every page at a route that exists', () => {
        const unknown = PAGE_ENTRIES.filter((entry) => !routeNames.has(entry.routeName))
        expect(unknown.map((entry) => entry.routeName)).toEqual([])
    })

    it('resolves every label and group key in english', () => {
        const missing: string[] = []
        for (const entry of PAGE_ENTRIES) {
            for (const key of [entry.labelKey, entry.groupKey]) {
                if (!resolves(en, key)) missing.push(`${entry.id}: ${key}`)
            }
        }
        expect(missing).toEqual([])
    })

    it('puts every page in a declared browse-map column', () => {
        const columns = new Set(PAGE_GROUPS)
        expect(PAGE_ENTRIES.filter((entry) => !columns.has(entry.groupKey))).toEqual([])
    })
})

// KIND_LABEL_KEYS lives in a record rather than inline t() calls, so the shell's
// static key sweep cannot see it. This is the walk that covers it.
describe('kind labels', () => {
    it('names a key for every kind', () => {
        expect(Object.keys(KIND_LABEL_KEYS).sort()).toEqual([...SEARCH_KINDS].sort())
    })

    it('resolves every kind label in every locale', () => {
        const found = locales()
        expect(found).toHaveLength(LOCALE_COUNT)
        const missing: string[] = []
        for (const [path, messages] of found) {
            for (const key of Object.values(KIND_LABEL_KEYS)) {
                if (!resolves(messages, key)) missing.push(`${path}: ${key}`)
            }
        }
        expect(missing).toEqual([])
    })
})

describe('palette chrome', () => {
    const KEYS = [
        'common.search',
        'views.shortcuts.ctrl',
        'layout.shell.search.hint',
        'layout.shell.search.recent',
        'layout.shell.search.jumpTo',
        'layout.shell.search.noResults',
        'layout.shell.search.more',
    ]

    it('resolves every chrome key in every locale', () => {
        const found = locales()
        expect(found).toHaveLength(LOCALE_COUNT)
        const missing: string[] = []
        for (const [path, messages] of found) {
            for (const key of KEYS) {
                if (!resolves(messages, key)) missing.push(`${path}: ${key}`)
            }
        }
        expect(missing).toEqual([])
    })

    it('keeps the count placeholder in every translation of the more row', () => {
        const missing: string[] = []
        for (const [path, messages] of locales()) {
            const value: unknown = 'layout.shell.search.more'
                .split('.')
                .reduce((node: any, part: string) => node?.[part], messages)
            if (typeof value !== 'string' || !value.includes('{count}')) missing.push(path)
        }
        expect(missing).toEqual([])
    })
})
