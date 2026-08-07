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

// Locale files are the one place in this repo where non-Latin scripts are
// expected, so they are also where a Trojan Source style reordering attack
// would be least likely to be noticed in review. GitLab's SAST no longer scans
// them: its BiDi rule reported the Arabic locale purely for being right to
// left, which is what Arabic is. This checks the actual thing that rule was
// reaching for, and only that.

import { describe, expect, it } from 'vitest'

const localeSources = import.meta.glob('../../i18n/locales/*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>

/**
 * The characters that can reorder rendered text (CVE-2021-42574), plus the
 * marks that can do it subtly. None of them belongs in a translation: the
 * renderer applies the Unicode bidirectional algorithm on its own, and every
 * locale here reads correctly without any of these.
 *
 * Held as code points rather than literals. A literal here is invisible in an
 * editor, and it makes this file itself trip every Trojan Source scanner that
 * looks for the raw characters.
 */
const BIDI_CONTROLS: Array<[number, string]> = [
    [0x202a, 'LEFT-TO-RIGHT EMBEDDING'],
    [0x202b, 'RIGHT-TO-LEFT EMBEDDING'],
    [0x202c, 'POP DIRECTIONAL FORMATTING'],
    [0x202d, 'LEFT-TO-RIGHT OVERRIDE'],
    [0x202e, 'RIGHT-TO-LEFT OVERRIDE'],
    [0x2066, 'LEFT-TO-RIGHT ISOLATE'],
    [0x2067, 'RIGHT-TO-LEFT ISOLATE'],
    [0x2068, 'FIRST STRONG ISOLATE'],
    [0x2069, 'POP DIRECTIONAL ISOLATE'],
    [0x200e, 'LEFT-TO-RIGHT MARK'],
    [0x200f, 'RIGHT-TO-LEFT MARK'],
    [0x061c, 'ARABIC LETTER MARK'],
]

describe('locale text', () => {
    it('ships at least the locales the app advertises', () => {
        // Guards the glob itself: a pattern that silently matches nothing would
        // make every check below pass without reading a single file.
        expect(Object.keys(localeSources).length).toBeGreaterThan(5)
    })

    it('has no bidi control characters in locales', () => {
        const offences: string[] = []
        for (const [path, source] of Object.entries(localeSources)) {
            source.split('\n').forEach((line, index) => {
                for (const [codePoint, name] of BIDI_CONTROLS) {
                    if (line.includes(String.fromCodePoint(codePoint))) {
                        offences.push(`${path}:${index + 1} contains ${name}`)
                    }
                }
            })
        }
        expect(offences).toEqual([])
    })
})
