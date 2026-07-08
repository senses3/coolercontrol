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

// Enforces the new-shell dependency discipline from ui-ia-redesign-plan.md:
// shell code may only use reka-ui, the vendored kit, and Tailwind utilities.

import { describe, expect, it } from 'vitest'

const shellFiles = import.meta.glob('../**/*.{ts,vue}', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>

const FORBIDDEN = ['primevue', 'element-plus', '@vue-flow', 'radix-vue', '@/presets']

// element-plus, radix-vue and primevue were fully removed (kit-chrome complete);
// nothing anywhere may reimport them.
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
            for (const dep of ['element-plus', 'radix-vue', 'primevue']) {
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
