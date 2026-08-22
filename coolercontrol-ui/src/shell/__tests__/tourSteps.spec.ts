// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { TOUR_STEPS } from '@/shell/tour.ts'

describe('tour steps', () => {
    it('has unique anchors and keys', () => {
        expect(new Set(TOUR_STEPS.map((step) => step.selector)).size).toBe(TOUR_STEPS.length)
        expect(new Set(TOUR_STEPS.map((step) => step.key)).size).toBe(TOUR_STEPS.length)
    })

    // The header carries no interface switch any more, so a step aimed at one
    // would silently attach to nothing.
    it('aims at no interface switch', () => {
        expect(TOUR_STEPS.some((step) => step.selector === '#ui-mode-switch')).toBe(false)
    })
})
