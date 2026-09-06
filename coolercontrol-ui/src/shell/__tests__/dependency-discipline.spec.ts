// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Enforces the new-shell dependency discipline from ui-ia-redesign-plan.md:
// shell code may only use reka-ui, the vendored kit, and Tailwind utilities.

import { describe, expect, it } from 'vitest'

const shellFiles = import.meta.glob('../**/*.{ts,vue}', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>

const FORBIDDEN = ['primevue', 'element-plus', '@vue-flow', 'radix-vue', '@/presets']

// element-plus, radix-vue, primevue and primeicons were fully removed (kit-chrome
// complete; icons are @mdi/js only); nothing anywhere may reimport them.
const allSrcFiles = import.meta.glob('../../**/*.{ts,vue}', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>

describe('shell dependency discipline', () => {
    it('imports no legacy UI libraries in shell code', () => {
        const offenders: string[] = []
        for (const [path, source] of Object.entries(shellFiles)) {
            if (path.includes('__tests__')) continue
            for (const dep of FORBIDDEN) {
                if (source.includes(`from '${dep}`) || source.includes(`import('${dep}`)) {
                    offenders.push(`${path} imports ${dep}`)
                }
            }
        }
        expect(offenders).toEqual([])
    })

    it('imports no removed dependencies anywhere', () => {
        const offenders: string[] = []
        for (const [path, source] of Object.entries(allSrcFiles)) {
            if (path.includes('__tests__')) continue
            for (const dep of ['element-plus', 'radix-vue', 'primevue', 'primeicons']) {
                if (source.includes(`from '${dep}'`) || source.includes(`'${dep}/`)) {
                    offenders.push(`${path} imports ${dep}`)
                }
            }
        }
        expect(offenders).toEqual([])
    })

    it('scans the shell sources', () => {
        expect(Object.keys(shellFiles).length).toBeGreaterThan(5)
    })
})
