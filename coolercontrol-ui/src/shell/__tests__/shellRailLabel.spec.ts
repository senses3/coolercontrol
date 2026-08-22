// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Rail labels clip rather than wrap, so a translation wider than the rail is
// only readable through the tooltip its item hosts. The label has to report
// that state and keep it current: a stale report is either a missing tooltip
// or one repeating text that is already on screen. jsdom has no layout, so the
// two widths the component compares are stubbed on the prototype, which lets it
// measure on mount exactly as it does in a browser.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ShellRailLabel from '../ShellRailLabel.vue'

// The label box in the 5.5rem rail: 77px less the nav's 8.75px of side padding.
const BOX_PX = 68.25
let textWidth = 0

beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
        configurable: true,
        get: () => textWidth,
    })
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
        configurable: true,
        get: () => BOX_PX,
    })
})
afterEach(() => {
    // @ts-expect-error restoring jsdom's own zero-width properties
    delete HTMLElement.prototype.scrollWidth
    // @ts-expect-error restoring jsdom's own zero-width properties
    delete HTMLElement.prototype.clientWidth
})

const mountLabel = (label: string, width: number) => {
    textWidth = width
    const wrapper = mount(ShellRailLabel, { props: { label, fontKey: 'bundled' } })
    return { wrapper, last: () => wrapper.emitted('update:truncated')?.at(-1)?.[0] }
}

describe('ShellRailLabel', () => {
    it('stays on one line and clips', () => {
        const { wrapper } = mountLabel('Monitoring', 41.1)
        expect(wrapper.classes()).toContain('truncate')
    })

    it('reports an overflowing label', () => {
        // Measured: 'Refroidissement' is 77.5px at the rail's 0.75rem.
        expect(mountLabel('Refroidissement', 77.5).last()).toBe(true)
    })

    it('reports a label that fits', () => {
        // Measured: 'Überwachung' is 65.2px, the label that reported the bug.
        expect(mountLabel('Überwachung', 65.2).last()).toBe(false)
    })

    // Switching locale swaps the text under a rail that has not moved.
    it('re-reports when the label changes', async () => {
        const { wrapper, last } = mountLabel('Cooling', 38.9)
        expect(last()).toBe(false)
        textWidth = 77.5
        await wrapper.setProps({ label: 'Refroidissement' })
        await nextTick()
        expect(last()).toBe(true)
    })

    // The interface-font setting changes the text width with the label untouched.
    it('re-reports when the font changes', async () => {
        const { wrapper, last } = mountLabel('Einstellungen', 64.2)
        expect(last()).toBe(false)
        textWidth = 80
        await wrapper.setProps({ fontKey: 'system' })
        await nextTick()
        expect(last()).toBe(true)
    })
})
