// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import type { RouteLocationRaw } from 'vue-router'
import type { ActionId } from '@/shell/search/actionCatalog.ts'

// Result kinds, in the order groups fall back to when their best scores tie.
export const SEARCH_KINDS = [
    'fan',
    'sensor',
    'device',
    'lighting',
    'lcd',
    'profile',
    'function',
    'mode',
    'dashboard',
    'alert',
    'customSensor',
    'plugin',
    'setting',
    'action',
    'page',
] as const

export type SearchKind = (typeof SEARCH_KINDS)[number]

export function kindRank(kind: SearchKind): number {
    return SEARCH_KINDS.indexOf(kind)
}

// Group headings. Almost all reuse a key that already exists in every locale;
// only the two the app had no word for are new. Held in a record rather than
// inline `t()` calls, so an unused-key sweep cannot see them: the search spec
// walks this map for exactly that reason.
export const KIND_LABEL_KEYS: Readonly<Record<SearchKind, string>> = Object.freeze({
    fan: 'layout.shell.search.kindFan',
    sensor: 'layout.shell.search.kindSensor',
    device: 'layout.shell.devices',
    lighting: 'layout.shell.sensorDest.lighting',
    lcd: 'layout.shell.sensorDest.lcd',
    profile: 'layout.shell.coolingPanel.profiles',
    function: 'layout.shell.coolingPanel.functions',
    mode: 'layout.shell.modes',
    dashboard: 'layout.menu.dashboards',
    alert: 'layout.menu.alerts',
    customSensor: 'layout.menu.customSensors',
    plugin: 'layout.shell.plugins',
    setting: 'layout.shell.settings',
    action: 'layout.shell.search.kindAction',
    page: 'layout.shell.search.kindPage',
})

// Every entry either goes somewhere or opens something. Nothing in the palette
// mutates device state on its own: an action hands off to the dialog or wizard
// that already owns the change.
export type SearchTarget = { route: RouteLocationRaw } | { action: ActionId }

export interface SearchEntry {
    /** Stable across rebuilds; recents are stored by this. */
    id: string
    kind: SearchKind
    /** Display label, in the active locale or straight from user data. */
    label: string
    /** English label, indexed alongside `label` when the two differ. */
    labelEn?: string
    /** Untranslated synonyms. Plain strings, deliberately not i18n keys. */
    keywords?: readonly string[]
    /** Where this lives, outermost first. Rendered under the label. */
    breadcrumb: string[]
    target: SearchTarget
}

export interface SearchGroup {
    kind: SearchKind
    entries: SearchEntry[]
    /** Matches beyond the per-group cap, revealed in place. */
    hidden: SearchEntry[]
}
