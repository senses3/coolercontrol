// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

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
 * The explicit formatting characters, which open a directional scope that runs
 * until it is popped and so can reorder whole spans of a line (CVE-2021-42574).
 * A translation never needs one: the renderer applies the Unicode bidirectional
 * algorithm on its own.
 *
 * The implicit marks (LRM, RLM, ALM) are deliberately absent. They are ordinary
 * typography in a mixed-direction string, where they settle which way the
 * neutral characters around an embedded Latin word lean, and the Arabic locale
 * uses one for exactly that. They open no scope, so they cannot carry the
 * attack this guards against.
 *
 * Held as code points rather than literals. A literal here is invisible in an
 * editor, and it makes this file itself trip every Trojan Source scanner that
 * looks for the raw characters.
 */
const BIDI_FORMATTING: Array<[number, string]> = [
    [0x202a, 'LEFT-TO-RIGHT EMBEDDING'],
    [0x202b, 'RIGHT-TO-LEFT EMBEDDING'],
    [0x202c, 'POP DIRECTIONAL FORMATTING'],
    [0x202d, 'LEFT-TO-RIGHT OVERRIDE'],
    [0x202e, 'RIGHT-TO-LEFT OVERRIDE'],
    [0x2066, 'LEFT-TO-RIGHT ISOLATE'],
    [0x2067, 'RIGHT-TO-LEFT ISOLATE'],
    [0x2068, 'FIRST STRONG ISOLATE'],
    [0x2069, 'POP DIRECTIONAL ISOLATE'],
]

describe('locale text', () => {
    it('ships at least the locales the app advertises', () => {
        // Guards the glob itself: a pattern that silently matches nothing would
        // make every check below pass without reading a single file.
        expect(Object.keys(localeSources).length).toBeGreaterThan(5)
    })

    it('has no bidi formatting characters in locales', () => {
        const offences: string[] = []
        for (const [path, source] of Object.entries(localeSources)) {
            source.split('\n').forEach((line, index) => {
                for (const [codePoint, name] of BIDI_FORMATTING) {
                    if (line.includes(String.fromCodePoint(codePoint))) {
                        offences.push(`${path}:${index + 1} contains ${name}`)
                    }
                }
            })
        }
        expect(offences).toEqual([])
    })
})
