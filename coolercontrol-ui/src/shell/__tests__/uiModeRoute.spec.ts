// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// UISettings.ts pulls in Dashboard.ts, whose class-transformer decorators need
// the polyfill.
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { UiMode } from '@/models/UISettings.ts'
import { routeAfterUiModeSwitch } from '@/shell/simple/uiModeRoute.ts'
import { sectionsFor } from '@/shell/sections.ts'

const routerSource = import.meta.glob('../../router/index.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
})['../../router/index.ts'] as string

describe('route after an interface switch', () => {
    // Every page simple mode owns exists in the full interface too, so switching
    // up never has to move the user.
    it('never moves the user when switching to the full interface', () => {
        expect(routeAfterUiModeSwitch(UiMode.FULL, { section: 'devices' })).toBeUndefined()
        expect(routeAfterUiModeSwitch(UiMode.FULL, { section: 'plugins' })).toBeUndefined()
        expect(routeAfterUiModeSwitch(UiMode.FULL, {})).toBeUndefined()
    })

    it('keeps a page the simple interface owns', () => {
        expect(
            routeAfterUiModeSwitch(UiMode.SIMPLE, { section: 'cooling', simple: true }),
        ).toBeUndefined()
        expect(
            routeAfterUiModeSwitch(UiMode.SIMPLE, { section: 'settings', simple: true }),
        ).toBeUndefined()
    })

    // Alerts and Modes are full-shell pages, but their sections survive the
    // switch under other names, so the user lands somewhere related.
    it('falls back to the section landing when the section survives', () => {
        expect(routeAfterUiModeSwitch(UiMode.SIMPLE, { section: 'monitoring' })).toBe(
            'section-monitoring',
        )
        expect(routeAfterUiModeSwitch(UiMode.SIMPLE, { section: 'cooling' })).toBe(
            'section-cooling',
        )
        expect(routeAfterUiModeSwitch(UiMode.SIMPLE, { section: 'home' })).toBe('section-home')
    })

    it('falls back to home when the section is gone as well', () => {
        expect(routeAfterUiModeSwitch(UiMode.SIMPLE, { section: 'devices' })).toBe('section-home')
        expect(routeAfterUiModeSwitch(UiMode.SIMPLE, { section: 'plugins' })).toBe('section-home')
        // A route with no section at all, such as not-found.
        expect(routeAfterUiModeSwitch(UiMode.SIMPLE, {})).toBe('section-home')
    })
})

// The rule above reads `meta.simple` off the route; nothing else ties that flag
// to the sections the simple rail actually has. A route flagged for a section
// simple mode dropped would keep the user on a page its rail cannot reach.
describe('simple route metadata', () => {
    it('flags only routes in a section the simple interface has', () => {
        const flagged = [...routerSource.matchAll(/section:\s*'([a-z]+)',\s*simple:\s*true/g)].map(
            (match) => match[1],
        )
        expect(flagged.length).toBe(7)
        const simpleSections = new Set(sectionsFor(UiMode.SIMPLE).map((section) => section.id))
        for (const section of flagged) {
            expect(simpleSections.has(section as never), section).toBe(true)
        }
    })
})
