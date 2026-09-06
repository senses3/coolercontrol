// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { appendLogChunk, highlightLogLine, LOG_LINE_CAP, toLogLines } from '../logLines.ts'

describe('highlightLogLine', () => {
    it('escapes html and wraps log levels', () => {
        const html = highlightLogLine('WARN <bad> & done')
        expect(html).toBe('<span class="text-warning">WARN</span> &lt;bad&gt; &amp; done')
    })

    it('escapes before highlighting so injected spans stay inert', () => {
        const html = highlightLogLine('<span>ERROR</span>')
        expect(html).toBe('&lt;span&gt;<span class="text-error">ERROR</span>&lt;/span&gt;')
    })
})

describe('toLogLines', () => {
    it('splits multi-line events and drops empty lines', () => {
        const lines = toLogLines('one\ntwo\n\nthree\n')
        expect(lines.map((line) => line.raw)).toEqual(['one', 'two', 'three'])
        expect(lines[0].html).toBe('one')
    })
})

describe('appendLogChunk', () => {
    it('appends chunks in order', () => {
        let lines = appendLogChunk([], 'a\nb\n')
        lines = appendLogChunk(lines, 'c\n')
        expect(lines.map((line) => line.raw)).toEqual(['a', 'b', 'c'])
    })

    it('drops the oldest lines past the cap', () => {
        const initial = appendLogChunk(
            [],
            Array.from({ length: LOG_LINE_CAP }, (_, i) => `line${i}`).join('\n'),
        )
        expect(initial).toHaveLength(LOG_LINE_CAP)
        const appended = appendLogChunk(initial, 'newest\n')
        expect(appended).toHaveLength(LOG_LINE_CAP)
        expect(appended[0].raw).toBe('line1')
        expect(appended[appended.length - 1].raw).toBe('newest')
    })
})
