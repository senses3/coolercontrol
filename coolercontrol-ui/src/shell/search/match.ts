// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Matching for the search palette. Hand-rolled rather than pulled from a
// library: shell code may only depend on reka-ui and the kit (see
// dependency-discipline.spec), the index is a few hundred entries so speed is
// irrelevant, and the ranking has to order by kind as well as by string
// closeness, which a generic scorer does not do.

import {
    kindRank,
    type SearchEntry,
    type SearchGroup,
    type SearchKind,
} from '@/shell/search/types.ts'

// Tiers, best first. The gaps are wide enough that no field weight can lift a
// weaker tier above a stronger one.
const EXACT = 1000
const PREFIX = 800
const WORD_PREFIX = 600
const SUBSTRING = 400
const SUBSEQUENCE = 200
const FUZZY = 100

// A hit on the entry's own name beats a hit on where it lives.
const FIELD_WEIGHTS = { label: 1, labelEn: 0.95, keyword: 0.7, breadcrumb: 0.4 }

// Below this many tier-one hits the typo pass runs. Above it there is already
// plenty to choose from and a fuzzy hit would only add noise.
const FUZZY_THRESHOLD = 5
// Damerau over a long label is both slow and meaningless: an edit distance of
// one against a forty-character string is not a typo the user made.
const FUZZY_MAX_LABEL = 24

const DIACRITICS = /\p{Diacritic}/gu

/** Lowercase, strip diacritics, collapse whitespace. */
export function normalise(value: string): string {
    return value.normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

// Word starts, so "rate" hits "Poll Rate" and "x670" hits "ASUS PRIME X670".
// A digit after a letter counts as a boundary for the same reason.
function wordPrefixIndex(haystack: string, needle: string): number {
    let from = 0
    while (from <= haystack.length - needle.length) {
        const at = haystack.indexOf(needle, from)
        if (at < 0) return -1
        const before = at === 0 ? ' ' : haystack[at - 1]
        if (at === 0 || /[\s\-_/.:]/.test(before) || (/\d/.test(needle[0]) && /\D/.test(before))) {
            return at
        }
        from = at + 1
    }
    return -1
}

// Every needle character in order. Compact runs score higher, so "plrt" prefers
// "Poll Rate" over a label that merely happens to contain those letters spread
// far apart.
function subsequenceDensity(haystack: string, needle: string): number {
    let at = -1
    let first = -1
    for (const char of needle) {
        at = haystack.indexOf(char, at + 1)
        if (at < 0) return 0
        if (first < 0) first = at
    }
    const span = at - first + 1
    return needle.length / span
}

/** Distance, or `max + 1` once it is certain the distance exceeds `max`. */
export function boundedDamerau(a: string, b: string, max: number): number {
    if (Math.abs(a.length - b.length) > max) return max + 1
    let prev2: number[] = []
    let prev: number[] = Array.from({ length: b.length + 1 }, (_, index) => index)
    for (let i = 1; i <= a.length; i++) {
        const row: number[] = [i]
        let best = i
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1
            let value = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                value = Math.min(value, prev2[j - 2] + 1)
            }
            row.push(value)
            best = Math.min(best, value)
        }
        if (best > max) return max + 1
        prev2 = prev
        prev = row
    }
    return prev[b.length]
}

function tierScore(haystack: string, needle: string): number {
    if (haystack.length === 0) return 0
    if (haystack === needle) return EXACT
    if (haystack.startsWith(needle)) return PREFIX
    if (wordPrefixIndex(haystack, needle) > 0) return WORD_PREFIX
    if (haystack.includes(needle)) return SUBSTRING
    const density = subsequenceDensity(haystack, needle)
    return density > 0 ? SUBSEQUENCE * density : 0
}

interface Normalised {
    label: string
    labelEn: string
    keywords: string[]
    breadcrumb: string
}

const cache = new WeakMap<SearchEntry, Normalised>()

function fields(entry: SearchEntry): Normalised {
    const hit = cache.get(entry)
    if (hit != null) return hit
    const built: Normalised = {
        label: normalise(entry.label),
        labelEn: entry.labelEn != null ? normalise(entry.labelEn) : '',
        keywords: (entry.keywords ?? []).map(normalise),
        breadcrumb: normalise(entry.breadcrumb.join(' ')),
    }
    cache.set(entry, built)
    return built
}

/** Tier-one score for one entry, or 0 when nothing matched. */
export function scoreEntry(entry: SearchEntry, query: string): number {
    const parts = fields(entry)
    let best = tierScore(parts.label, query) * FIELD_WEIGHTS.label
    if (parts.labelEn !== '' && parts.labelEn !== parts.label) {
        best = Math.max(best, tierScore(parts.labelEn, query) * FIELD_WEIGHTS.labelEn)
    }
    for (const keyword of parts.keywords) {
        best = Math.max(best, tierScore(keyword, query) * FIELD_WEIGHTS.keyword)
    }
    // Breadcrumbs only ever contribute a whole-word hit. Letting them match by
    // subsequence made every entry under "Monitoring" answer to "min".
    const crumb = tierScore(parts.breadcrumb, query)
    if (crumb >= SUBSTRING) best = Math.max(best, crumb * FIELD_WEIGHTS.breadcrumb)
    return best
}

/** Typo score for one entry, or 0. Only ever called under the tier-one gate. */
export function fuzzyScore(entry: SearchEntry, query: string): number {
    const max = query.length <= 4 ? 1 : 2
    const parts = fields(entry)
    let best = 0
    for (const [haystack, weight] of [
        [parts.label, FIELD_WEIGHTS.label],
        [parts.labelEn, FIELD_WEIGHTS.labelEn],
    ] as const) {
        if (haystack === '' || haystack.length > FUZZY_MAX_LABEL) continue
        // Whole label first, then each word, so a typo in one word of a
        // multi-word label still lands.
        for (const candidate of [haystack, ...haystack.split(' ')]) {
            if (candidate.length === 0) continue
            const distance = boundedDamerau(query, candidate, max)
            if (distance > max) continue
            best = Math.max(best, (FUZZY - distance * 10) * weight)
        }
    }
    return best
}

export interface Scored {
    entry: SearchEntry
    score: number
}

// Ties break by kind order first (so a fan beats a page at equal closeness),
// then by the shorter label, then by name for a stable order across rebuilds.
function compare(a: Scored, b: Scored): number {
    if (a.score !== b.score) return b.score - a.score
    const kinds = kindRank(a.entry.kind) - kindRank(b.entry.kind)
    if (kinds !== 0) return kinds
    const lengths = a.entry.label.length - b.entry.label.length
    if (lengths !== 0) return lengths
    return a.entry.label.localeCompare(b.entry.label)
}

/** Ranked matches for `query`, best first. An empty query matches nothing. */
export function searchEntries(entries: readonly SearchEntry[], query: string): Scored[] {
    const needle = normalise(query)
    if (needle.length === 0) return []

    const hits: Scored[] = []
    const misses: SearchEntry[] = []
    for (const entry of entries) {
        const score = scoreEntry(entry, needle)
        if (score > 0) hits.push({ entry, score })
        else misses.push(entry)
    }
    if (hits.length < FUZZY_THRESHOLD) {
        for (const entry of misses) {
            const score = fuzzyScore(entry, needle)
            if (score > 0) hits.push({ entry, score })
        }
    }
    return hits.sort(compare)
}

/** Matches beyond this many in one group are hidden behind "N more". */
export const GROUP_CAP = 5

/**
 * Ranked matches folded into per-kind groups, groups ordered by their
 * best-scoring member.
 *
 * Grouping rather than one flat list is the point: with ten devices a
 * three-letter query matches dozens of channels, and a flat list would bury
 * the settings row or the action the user actually meant under them.
 */
export function groupResults(scored: readonly Scored[]): SearchGroup[] {
    const groups = new Map<SearchKind, SearchGroup>()
    for (const { entry } of scored) {
        const group = groups.get(entry.kind)
        if (group == null) {
            groups.set(entry.kind, { kind: entry.kind, entries: [entry], hidden: [] })
        } else if (group.entries.length < GROUP_CAP) {
            group.entries.push(entry)
        } else {
            group.hidden.push(entry)
        }
    }
    // Insertion order already follows the best score in each group, because
    // `scored` arrives sorted and a group is created at its first member.
    return [...groups.values()]
}
