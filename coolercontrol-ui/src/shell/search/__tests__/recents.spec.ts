// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearRecents, recentIds, rememberRecent, RECENTS_LIMIT } from '../recents.ts'

beforeEach(() => localStorage.clear())
afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
})

describe('recents', () => {
    it('starts empty', () => {
        expect(recentIds()).toEqual([])
    })

    it('keeps the most recent first', () => {
        rememberRecent('a')
        rememberRecent('b')
        expect(recentIds()).toEqual(['b', 'a'])
    })

    it('moves a repeat to the front instead of duplicating it', () => {
        rememberRecent('a')
        rememberRecent('b')
        rememberRecent('a')
        expect(recentIds()).toEqual(['a', 'b'])
    })

    it('caps the list, dropping the oldest', () => {
        for (let index = 0; index <= RECENTS_LIMIT; index++) rememberRecent(`id-${index}`)
        const ids = recentIds()
        expect(ids).toHaveLength(RECENTS_LIMIT)
        expect(ids).not.toContain('id-0')
        expect(ids[0]).toBe(`id-${RECENTS_LIMIT}`)
    })

    it('clears', () => {
        rememberRecent('a')
        clearRecents()
        expect(recentIds()).toEqual([])
    })

    // A hand-edited or half-written value must not take the palette down with it.
    it('ignores unparseable storage', () => {
        localStorage.setItem('search-recents', '{not json')
        expect(recentIds()).toEqual([])
    })

    it('ignores a stored value of the wrong shape', () => {
        localStorage.setItem('search-recents', '{"a":1}')
        expect(recentIds()).toEqual([])
    })

    it('drops non-string members', () => {
        localStorage.setItem('search-recents', '["a",7,null,"b"]')
        expect(recentIds()).toEqual(['a', 'b'])
    })

    it('survives storage that refuses to write', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota')
        })
        expect(() => rememberRecent('a')).not.toThrow()
    })
})
