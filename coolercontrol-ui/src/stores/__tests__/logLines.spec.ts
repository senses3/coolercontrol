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
