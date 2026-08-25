// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { defaultGraphCurve, placeholderGraphCurve } from '@/shell/cooling/defaultCurve.ts'

describe('default graph curve', () => {
    // What the profile editor draws when a Graph profile has no points yet.
    it('ramps from off to full across the temp range in five points', () => {
        expect(defaultGraphCurve(20, 100, 2, 17)).toEqual([
            [20, 0],
            [40, 25],
            [60, 50],
            [80, 75],
            [100, 100],
        ])
    })

    // A device that caps profiles below five points gets its own cap; one that
    // demands more than five gets its maximum, since the minimum has to be met.
    it('follows the device point limits', () => {
        expect(defaultGraphCurve(20, 100, 2, 3)).toHaveLength(3)
        expect(defaultGraphCurve(20, 100, 8, 8)).toHaveLength(8)
        expect(defaultGraphCurve(20, 100, 2, 17)).toHaveLength(5)
    })

    it('rounds temps to a tenth and duties to whole percents', () => {
        for (const [temp, duty] of defaultGraphCurve(21, 94, 2, 17)) {
            expect(Math.round(temp * 10)).toBe(temp * 10)
            expect(Math.round(duty)).toBe(duty)
        }
    })

    it('spans the range it is given', () => {
        const curve = defaultGraphCurve(30, 90, 2, 17)
        expect(curve[0]).toEqual([30, 0])
        expect(curve.at(-1)).toEqual([90, 100])
    })
})

describe('placeholder graph curve', () => {
    // Drawn when no temp source has been chosen, so it has no device range to
    // follow. It once stepped to 1875C, which is nowhere near the chart.
    it('stays on the default axis', () => {
        expect(placeholderGraphCurve()).toEqual([
            [0, 0],
            [25, 25],
            [50, 50],
            [75, 75],
            [100, 100],
        ])
    })
})
