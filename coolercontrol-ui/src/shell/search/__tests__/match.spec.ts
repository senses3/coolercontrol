// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// The ranking rules that make the palette usable, pinned so a later tweak to
// the scoring cannot quietly reorder them.

import { describe, expect, it } from 'vitest'
import { boundedDamerau, groupResults, normalise, scoreEntry, searchEntries } from '../match.ts'
import type { SearchEntry, SearchKind } from '../types.ts'

function entry(label: string, over: Partial<SearchEntry> = {}): SearchEntry {
    return {
        id: over.id ?? label,
        kind: over.kind ?? 'fan',
        label,
        breadcrumb: over.breadcrumb ?? [],
        target: { route: { name: 'section-home' } },
        ...over,
    }
}

const labelsOf = (entries: SearchEntry[], query: string): string[] =>
    searchEntries(entries, query).map((hit) => hit.entry.label)

describe('normalise', () => {
    it('folds case, diacritics and whitespace', () => {
        expect(normalise('  Lüfter   Eins ')).toBe('lufter eins')
        expect(normalise('Ventilateur Arrière')).toBe('ventilateur arriere')
    })

    it('leaves CJK alone', () => {
        expect(normalise('风扇')).toBe('风扇')
    })
})

describe('tier ordering', () => {
    const entries = [
        entry('Pump'),
        entry('Pump Duty'),
        entry('Water Pump Speed'),
        entry('Power Usage'),
    ]

    it('puts exact above prefix above word-prefix above subsequence', () => {
        expect(labelsOf(entries, 'pump')).toEqual(['Pump', 'Pump Duty', 'Water Pump Speed'])
    })

    it('scores an exact match above every other tier', () => {
        expect(scoreEntry(entry('Pump'), 'pump')).toBeGreaterThan(
            scoreEntry(entry('Pump Duty'), 'pump'),
        )
    })

    it('matches a word start inside a label', () => {
        expect(labelsOf([entry('Poll Rate')], 'rate')).toEqual(['Poll Rate'])
    })

    it('matches a digit run after letters', () => {
        expect(labelsOf([entry('ASUS PRIME X670')], 'x670')).toEqual(['ASUS PRIME X670'])
    })
})

describe('subsequence', () => {
    it('finds initials scattered through a label', () => {
        expect(labelsOf([entry('Poll Rate')], 'plrt')).toEqual(['Poll Rate'])
    })

    it('prefers the denser subsequence', () => {
        const dense = entry('Poll Rate')
        const sparse = entry('Please Look At Recent Trends')
        expect(scoreEntry(dense, 'plrt')).toBeGreaterThan(scoreEntry(sparse, 'plrt'))
    })

    it('rejects characters out of order', () => {
        expect(labelsOf([entry('Poll Rate')], 'trlp')).toEqual([])
    })
})

describe('fields', () => {
    it('matches the english label when the locale label does not', () => {
        const row = entry('Abfragerate', { labelEn: 'Polling Rate' })
        expect(labelsOf([row], 'polling')).toEqual(['Abfragerate'])
    })

    it('matches a keyword', () => {
        const row = entry('Polling Rate', { keywords: ['interval', 'hz'] })
        expect(labelsOf([row], 'interval')).toEqual(['Polling Rate'])
    })

    it('ranks a label hit above a keyword hit', () => {
        const byLabel = entry('Interval', { id: 'a' })
        const byKeyword = entry('Polling Rate', { id: 'b', keywords: ['interval'] })
        expect(labelsOf([byKeyword, byLabel], 'interval')).toEqual(['Interval', 'Polling Rate'])
    })

    // Letting a breadcrumb match by subsequence made every entry under
    // "Monitoring" answer to "min", which drowned the real hits.
    it('only lets a breadcrumb match a whole substring', () => {
        const row = entry('Fan 1', { breadcrumb: ['Monitoring', 'Kraken'] })
        expect(labelsOf([row], 'min')).toEqual([])
        expect(labelsOf([row], 'kraken')).toEqual(['Fan 1'])
    })
})

describe('typo pass', () => {
    it('measures a transposition as one edit', () => {
        expect(boundedDamerau('kraekn', 'kraken', 2)).toBe(1)
    })

    it('gives up early rather than computing a large distance', () => {
        expect(boundedDamerau('abc', 'zzzzzzzzzz', 1)).toBe(2)
    })

    it('recovers a transposed query when tier one is thin', () => {
        expect(labelsOf([entry('Kraken')], 'kraekn')).toEqual(['Kraken'])
    })

    it('still finds nothing for a query that resembles nothing', () => {
        expect(labelsOf([entry('Kraken')], 'xyzzyq')).toEqual([])
    })

    // The gate is the point: with plenty of real hits, a fuzzy match is noise.
    it('stays out of the way once tier one is full', () => {
        const entries = [
            entry('Fan 1'),
            entry('Fan 2'),
            entry('Fan 3'),
            entry('Fan 4'),
            entry('Fan 5'),
            entry('Fun'),
        ]
        expect(labelsOf(entries, 'fan')).not.toContain('Fun')
    })
})

describe('searchEntries', () => {
    it('matches nothing for an empty or blank query', () => {
        expect(searchEntries([entry('Pump')], '')).toEqual([])
        expect(searchEntries([entry('Pump')], '   ')).toEqual([])
    })

    it('breaks equal scores by kind order, then by label length', () => {
        const page = entry('Fan', { id: 'p', kind: 'page' })
        const fan = entry('Fan', { id: 'f', kind: 'fan' })
        expect(searchEntries([page, fan], 'fan').map((hit) => hit.entry.id)).toEqual(['f', 'p'])
    })
})

describe('groupResults', () => {
    const many = (kind: SearchKind, count: number): SearchEntry[] =>
        Array.from({ length: count }, (_, index) =>
            entry(`Fan ${index}`, { id: `${kind}-${index}`, kind }),
        )

    it('caps a group and parks the rest as hidden', () => {
        const groups = groupResults(searchEntries(many('fan', 8), 'fan'))
        expect(groups).toHaveLength(1)
        expect(groups[0].entries).toHaveLength(5)
        expect(groups[0].hidden).toHaveLength(3)
    })

    // A settings hit must survive a query that also matches thirty channels;
    // that is the whole reason results are grouped rather than flat.
    it('keeps a lesser-scoring kind visible behind a flood of one kind', () => {
        const flood = many('fan', 30)
        const setting = entry('Hide Duplicate Fan Sensors', { id: 's', kind: 'setting' })
        const groups = groupResults(searchEntries([...flood, setting], 'fan'))
        expect(groups.map((group) => group.kind)).toContain('setting')
    })

    it('orders groups by their best-scoring member', () => {
        const weak = entry('Silent Fan Curve', { id: 'w', kind: 'profile' })
        const strong = entry('Fan', { id: 's', kind: 'page' })
        const groups = groupResults(searchEntries([weak, strong], 'fan'))
        expect(groups[0].kind).toBe('page')
    })
})
