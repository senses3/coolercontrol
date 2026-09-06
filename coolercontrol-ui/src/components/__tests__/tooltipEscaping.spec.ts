// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { escapeHtml, safeColor } from '@/components/htmlEscaping.ts'

// The chart tooltip is built as a markup string and assigned to innerHTML. Its line name
// is a sensor or channel label, which originates from hwmon, a liquidctl device, a service
// plugin, or the user's own name overrides. None of those are trusted to be markup-free,
// and the tooltip renders same-origin against a daemon that writes to hardware as root.
describe('chart tooltip escaping', () => {
    it('neutralises markup in a line name', () => {
        expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
            '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
        )
    })

    it('escapes ampersands first so an entity cannot be reconstructed', () => {
        // &lt;script&gt; must not decode back into a tag: escaping < before & would
        // leave the & of an injected entity untouched.
        expect(escapeHtml('&lt;script&gt;')).toBe('&amp;lt;script&amp;gt;')
    })

    it('leaves an ordinary label alone', () => {
        expect(escapeHtml('CPU Package')).toBe('CPU Package')
        expect(escapeHtml('Fan #1 (rear)')).toBe('Fan #1 (rear)')
    })

    it('treats a missing name as empty rather than printing undefined', () => {
        expect(escapeHtml(undefined)).toBe('')
    })

    it('passes through the colour forms the picker produces', () => {
        for (const color of [
            '#fff',
            '#00aaff',
            '#00aaffcc',
            'rgb(0, 170, 255)',
            'rgba(0,170,255,0.5)',
        ]) {
            expect(safeColor(color)).toBe(color)
        }
    })

    it('rejects a colour that could break out of the style attribute', () => {
        // The value lands inside style="fill:...", where escaping alone would not stop a
        // declaration from being closed early.
        expect(safeColor('red;" onload="alert(1)')).toBe('currentColor')
        expect(safeColor('url(javascript:alert(1))')).toBe('currentColor')
        expect(safeColor(undefined)).toBe('currentColor')
    })
})
