// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeToasts, useToast } from '../toast.ts'

const { add, remove, removeAll, pauseAll, resumeAll } = useToast()

describe('toast countdown pausing', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        removeAll()
    })
    afterEach(() => {
        removeAll()
        vi.useRealTimers()
    })

    it('expires a toast on its own', () => {
        add({ summary: 'one', life: 1000 })
        expect(activeToasts.length).toBe(1)
        vi.advanceTimersByTime(1001)
        expect(activeToasts.length).toBe(0)
    })

    it('holds the countdown while paused and resumes it after', () => {
        add({ summary: 'one', life: 1000 })
        pauseAll()
        vi.advanceTimersByTime(5000)
        expect(activeToasts.length).toBe(1)
        resumeAll()
        vi.advanceTimersByTime(1001)
        expect(activeToasts.length).toBe(0)
    })

    it('unsticks later toasts when the last one is dismissed while paused', () => {
        // The container carrying mouseleave unmounts with the last toast, so nothing
        // resumes the countdowns. Without the empty-stack reset every later toast is
        // created paused and never expires.
        add({ summary: 'one', life: 1000 })
        pauseAll()
        remove(activeToasts[0].id)

        add({ summary: 'two', life: 1000 })
        vi.advanceTimersByTime(1001)
        expect(activeToasts.length).toBe(0)
    })

    it('unsticks later toasts after dismiss-all while paused', () => {
        add({ summary: 'one', life: 1000 })
        add({ summary: 'two', life: 1000 })
        pauseAll()
        removeAll()

        add({ summary: 'three', life: 1000 })
        vi.advanceTimersByTime(1001)
        expect(activeToasts.length).toBe(0)
    })
})
