// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// The point of the shared help icon is that hovering only previews while
// clicking pins the text open, so a multi-line list can be read without
// keeping the pointer still. Both halves are asserted here because the
// hover-open path is what makes the pinned path easy to break.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en.ts'
import HelpIcon from '@/components/info/HelpIcon.vue'

// The real store drags in the router and the whole shell for one rem helper.
vi.mock('@/stores/DeviceStore.ts', () => ({
    useDeviceStore: () => ({ getREMSize: (rem: number) => rem * 16 }),
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function mountIcon(props: Record<string, unknown> = {}) {
    return mount(HelpIcon, {
        props: { text: 'Ctrl+Scroll to zoom', ...props },
        global: { plugins: [i18n], stubs: { SvgIcon: true } },
    })
}

const trigger = (wrapper: ReturnType<typeof mountIcon>) => wrapper.get('button')
// jsdom's Presence never fires the exit animation, so the portalled node
// outlives the close. aria-expanded is the state users are actually told.
const isOpen = (wrapper: ReturnType<typeof mountIcon>) =>
    trigger(wrapper).attributes('aria-expanded') === 'true'

describe('HelpIcon', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        document.body.innerHTML = ''
    })

    it('stays closed until the hover delay elapses', async () => {
        const wrapper = mountIcon()
        await trigger(wrapper).trigger('mouseenter')
        expect(isOpen(wrapper)).toBe(false)

        vi.advanceTimersByTime(300)
        await wrapper.vm.$nextTick()
        expect(isOpen(wrapper)).toBe(true)
        expect(document.body.textContent).toContain('Ctrl+Scroll to zoom')
        wrapper.unmount()
    })

    it('closes again on mouseleave when it was only hovered', async () => {
        const wrapper = mountIcon()
        await trigger(wrapper).trigger('mouseenter')
        vi.advanceTimersByTime(300)
        await wrapper.vm.$nextTick()

        await trigger(wrapper).trigger('mouseleave')
        vi.advanceTimersByTime(150)
        await wrapper.vm.$nextTick()
        expect(isOpen(wrapper)).toBe(false)
        wrapper.unmount()
    })

    it('keeps the text open on mouseleave once it has been clicked', async () => {
        const wrapper = mountIcon()
        await trigger(wrapper).trigger('click')
        await wrapper.vm.$nextTick()
        expect(isOpen(wrapper)).toBe(true)

        await trigger(wrapper).trigger('mouseleave')
        vi.advanceTimersByTime(1000)
        await wrapper.vm.$nextTick()
        expect(isOpen(wrapper)).toBe(true)
        wrapper.unmount()
    })

    it('unpins on a second click', async () => {
        const wrapper = mountIcon()
        await trigger(wrapper).trigger('click')
        await trigger(wrapper).trigger('click')
        await wrapper.vm.$nextTick()
        expect(isOpen(wrapper)).toBe(false)
        wrapper.unmount()
    })

    // Containers autofocus their first focusable child on open, and this button
    // is often it. Opening on focus made the settings popover show a help
    // popover the moment it appeared.
    it('does not open when something focuses the trigger', async () => {
        const wrapper = mountIcon()
        await trigger(wrapper).trigger('focus')
        vi.advanceTimersByTime(1000)
        await wrapper.vm.$nextTick()
        expect(isOpen(wrapper)).toBe(false)
        wrapper.unmount()
    })

    // A button with a popover still has to be reachable without a pointer.
    it('opens from the keyboard, since Enter and Space fire a click', async () => {
        const wrapper = mountIcon()
        await trigger(wrapper).trigger('click')
        await wrapper.vm.$nextTick()
        expect(isOpen(wrapper)).toBe(true)
        wrapper.unmount()
    })

    // PopoverRoot is a fragment, so without an explicit forward Vue drops the
    // class and every positioned call site silently falls back to flow layout.
    it('forwards a call-site class onto the trigger', () => {
        const wrapper = mount(HelpIcon, {
            props: { text: 'Ctrl+Scroll to zoom' },
            attrs: { class: 'absolute left-1/2' },
            global: { plugins: [i18n], stubs: { SvgIcon: true } },
        })
        expect(trigger(wrapper).classes()).toContain('absolute')
        expect(trigger(wrapper).classes()).toContain('left-1/2')
        expect(trigger(wrapper).classes()).toContain('cursor-help')
        wrapper.unmount()
    })

    it('names the trigger for screen readers, from the label when there is one', () => {
        const plain = mountIcon()
        expect(trigger(plain).attributes('aria-label')).toBe('More information')
        plain.unmount()

        const labelled = mountIcon({ label: 'Mouse actions' })
        expect(trigger(labelled).attributes('aria-label')).toBe('Mouse actions')
        expect(labelled.text()).toContain('Mouse actions')
        labelled.unmount()
    })
})
