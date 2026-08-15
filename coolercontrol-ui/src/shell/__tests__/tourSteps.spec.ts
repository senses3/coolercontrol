// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// UISettings.ts pulls in Dashboard.ts, whose class-transformer decorators need
// the polyfill.
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { UiMode } from '@/models/UISettings.ts'
import { SIMPLE_TOUR_STEPS, TOUR_STEPS, tourStepsFor } from '@/shell/tour.ts'

describe('tour steps per interface', () => {
    it('walks each interface with its own list', () => {
        expect(tourStepsFor(UiMode.FULL)).toBe(TOUR_STEPS)
        expect(tourStepsFor(UiMode.SIMPLE)).toBe(SIMPLE_TOUR_STEPS)
    })

    // The simple rail has no Devices, Plugins or Modes, and its remaining
    // sections are named and described differently, so it shares no step keys
    // with the full walk beyond the two surfaces that really are identical.
    it('points the simple walk only at anchors the simple shell renders', () => {
        const simpleAnchors = ['#rail-home', '#rail-cooling', '#rail-monitoring', '#rail-settings']
        for (const step of SIMPLE_TOUR_STEPS) {
            if (step.selector === '#ui-mode-switch') continue
            expect(simpleAnchors, step.selector).toContain(step.selector)
        }
    })

    // The switch is what makes the other interface discoverable, so neither
    // walk may drop it.
    it('shows the interface switch in both walks', () => {
        for (const steps of [TOUR_STEPS, SIMPLE_TOUR_STEPS]) {
            expect(steps.some((step) => step.selector === '#ui-mode-switch')).toBe(true)
        }
    })

    it('has unique anchors and keys within each walk', () => {
        for (const steps of [TOUR_STEPS, SIMPLE_TOUR_STEPS]) {
            expect(new Set(steps.map((s) => s.selector)).size).toBe(steps.length)
            expect(new Set(steps.map((s) => s.key)).size).toBe(steps.length)
        }
    })
})
