// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Kit toast: a drop-in replacement for PrimeVue's useToast() rendered by
// shell/ui/UiToast.vue. Same `.add({ severity, summary, detail, life })` shape
// so call sites only swap the import path.
import { reactive } from 'vue'

export interface ToastMessage {
    severity?: string
    summary?: string
    detail?: string
    life?: number
    group?: string
}

export interface StoredToast extends ToastMessage {
    id: number
}

const DEFAULT_LIFE = 3000
// Errors carry diagnostic text users need time to read and copy, so they get a
// longer floor. The countdown pauses while the stack is hovered/focused, so
// this is a minimum rather than a cap; untouched errors still expire, keeping
// error storms self-clearing.
const ERROR_MIN_LIFE = 10000

const toasts = reactive<StoredToast[]>([])
let nextId = 0

interface Timer {
    remaining: number
    startedAt: number
    handle?: ReturnType<typeof setTimeout>
}
const timers = new Map<number, Timer>()
let paused = false

// The hovered container is what resumes the countdowns, and it unmounts with the
// last toast. Nothing would fire mouseleave then, so an emptied stack clears the
// flag itself; otherwise every later toast is created paused and never expires.
const clearPauseIfEmpty = (): void => {
    if (toasts.length === 0) paused = false
}

const remove = (id: number): void => {
    const timer = timers.get(id)
    if (timer?.handle != null) clearTimeout(timer.handle)
    timers.delete(id)
    const index = toasts.findIndex((toast) => toast.id === id)
    if (index >= 0) toasts.splice(index, 1)
    clearPauseIfEmpty()
}

const startTimer = (id: number): void => {
    const timer = timers.get(id)
    if (timer == null || paused || timer.remaining <= 0) return
    timer.startedAt = Date.now()
    timer.handle = setTimeout(() => remove(id), timer.remaining)
}

const add = (message: ToastMessage): void => {
    const id = nextId++
    toasts.push({ ...message, id })
    let life = message.life ?? DEFAULT_LIFE
    const isError = message.severity === 'error' || message.severity === 'danger'
    if (isError && life > 0) life = Math.max(life, ERROR_MIN_LIFE)
    // life <= 0 stays sticky (no timer).
    if (life > 0) {
        timers.set(id, { remaining: life, startedAt: Date.now() })
        startTimer(id)
    }
}

// Freeze every countdown while the stack is hovered or focused so users can
// read and copy without racing the timer; resume restarts each from the time
// that was left.
const pauseAll = (): void => {
    if (paused) return
    paused = true
    const now = Date.now()
    for (const timer of timers.values()) {
        if (timer.handle == null) continue
        clearTimeout(timer.handle)
        timer.handle = undefined
        timer.remaining = Math.max(0, timer.remaining - (now - timer.startedAt))
    }
}
const resumeAll = (): void => {
    if (!paused) return
    paused = false
    for (const id of timers.keys()) startTimer(id)
}

const removeGroup = (group: string): void => {
    for (let i = toasts.length - 1; i >= 0; i--) {
        if (toasts[i].group === group) remove(toasts[i].id)
    }
}

const removeAll = (): void => {
    for (const timer of timers.values()) if (timer.handle != null) clearTimeout(timer.handle)
    timers.clear()
    toasts.length = 0
    clearPauseIfEmpty()
}

export const activeToasts = toasts

export function useToast() {
    return {
        add,
        remove,
        removeGroup,
        removeAll,
        removeAllGroups: removeAll,
        pauseAll,
        resumeAll,
    }
}
