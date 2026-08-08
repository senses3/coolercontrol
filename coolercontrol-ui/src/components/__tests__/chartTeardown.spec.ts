// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Guards against the TimeChart leak class: a component that constructs an observer or a
// uPlot instance and never releases it. Observers are the retainer that matters. They keep
// the observed element reachable, which keeps its listener closures, the chart instance and
// the series arrays alive for the life of the page. TimeChart is remounted by chartKey on
// every dashboard/device settings change, so each miss stranded ~6-12 MB permanently.
//
// Source-level rather than a mount test on purpose: TimeChart needs DeviceStore,
// SettingsStore, ThemeColorsStore, i18n, an injected emitter and a real canvas, and those
// stores cannot be constructed outside a component. A presence check costs nothing, has no
// fixtures to rot, and does not depend on variable names surviving a refactor.
//
// Limits worth knowing: the rules below are per-file presence checks, so a file holding two
// observers where only one is released still passes. They catch the gross case (constructed,
// never released anywhere) rather than proving each instance is paired.

import { describe, expect, it } from 'vitest'

const sourceFiles = import.meta.glob('../../**/*.{ts,vue}', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>

interface Rule {
    constructs: string
    releases: string
}

// No exceptions. Every offender found when this rule was written was fixed in the same
// change, so a failure here is always a new leak, never pre-existing debt.
const RULES: Rule[] = [
    { constructs: 'new uPlot(', releases: '.destroy()' },
    { constructs: 'new IntersectionObserver(', releases: '.disconnect()' },
    { constructs: 'new ResizeObserver(', releases: '.disconnect()' },
]

// Vite normalizes glob keys to the shortest relative path from this file, so
// '../TimeChart.vue' and '../../views/ProfileView.vue' both appear. Resolve them against
// this directory to get stable src-relative paths.
const normalize = (path: string): string => {
    const segments = ['src', 'components', '__tests__']
    for (const part of path.split('/')) {
        if (part === '.' || part === '') continue
        if (part === '..') segments.pop()
        else segments.push(part)
    }
    return segments.slice(1).join('/')
}

describe('chart and observer teardown', () => {
    for (const rule of RULES) {
        it(`releases every ${rule.constructs.replace(/^new |\($/g, '')} with ${rule.releases}`, () => {
            const offenders: string[] = []
            for (const [path, source] of Object.entries(sourceFiles)) {
                if (path.includes('__tests__')) continue
                if (!source.includes(rule.constructs)) continue
                if (source.includes(rule.releases)) continue
                offenders.push(normalize(path))
            }
            expect(
                offenders,
                `constructs ${rule.constructs} but never calls ${rule.releases}`,
            ).toEqual([])
        })
    }

    it('tears TimeChart down completely on unmount', () => {
        const entry = Object.entries(sourceFiles).find(
            ([path]) => normalize(path) === 'components/TimeChart.vue',
        )
        expect(entry, 'TimeChart.vue not found').toBeDefined()
        const source = entry![1]

        const unmount = source.match(/onUnmounted\(\(\) => \{([\s\S]*?)\n\}\)/)
        expect(unmount, 'onUnmounted block not found').not.toBeNull()
        const body = unmount![1]

        // Every retainer created in onMounted must be released here.
        for (const release of [
            'stopRaf()',
            'visibilityObserver?.disconnect()',
            'resizeObserver?.disconnect()',
            'chart?.destroy()',
        ]) {
            expect(body, `onUnmounted is missing ${release}`).toContain(release)
        }
    })

    it('keeps the observers at module scope so unmount can reach them', () => {
        const entry = Object.entries(sourceFiles).find(
            ([path]) => normalize(path) === 'components/TimeChart.vue',
        )
        const source = entry![1]
        // A `const resizeObserver = new ResizeObserver(...)` inside onMounted is invisible
        // to onUnmounted, which is exactly how the original leak happened.
        expect(source).not.toMatch(/(const|let)\s+resizeObserver\s*=\s*new ResizeObserver/)
        expect(source).not.toMatch(
            /(const|let)\s+visibilityObserver\s*=\s*new IntersectionObserver/,
        )
    })
})
