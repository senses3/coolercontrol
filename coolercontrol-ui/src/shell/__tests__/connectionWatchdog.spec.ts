// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import {
    CONNECTION_LOST_GRACE_MS,
    formatDisconnectedFor,
    isConnectionLost,
} from '@/shell/connectionWatchdog.ts'

const deviceStoreSource = import.meta.glob('../../stores/DeviceStore.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>

describe('isConnectionLost', () => {
    it('holds through a drop shorter than the grace period', () => {
        expect(isConnectionLost(0)).toBe(false)
        expect(isConnectionLost(CONNECTION_LOST_GRACE_MS - 1)).toBe(false)
        expect(isConnectionLost(CONNECTION_LOST_GRACE_MS)).toBe(false)
    })

    it('trips once the grace period is exceeded', () => {
        expect(isConnectionLost(CONNECTION_LOST_GRACE_MS + 1)).toBe(true)
        expect(isConnectionLost(60_000)).toBe(true)
    })
})

describe('formatDisconnectedFor', () => {
    it('clamps a negative or sub-second elapsed time', () => {
        expect(formatDisconnectedFor(-5_000)).toBe('0:00')
        expect(formatDisconnectedFor(999)).toBe('0:00')
    })

    it('pads seconds under a minute', () => {
        expect(formatDisconnectedFor(9_000)).toBe('0:09')
        expect(formatDisconnectedFor(47_400)).toBe('0:47')
    })

    it('carries into minutes', () => {
        expect(formatDisconnectedFor(60_000)).toBe('1:00')
        expect(formatDisconnectedFor(192_000)).toBe('3:12')
        expect(formatDisconnectedFor(3_599_000)).toBe('59:59')
    })

    it('switches to hours so a long outage stays readable', () => {
        expect(formatDisconnectedFor(3_600_000)).toBe('1:00:00')
        expect(formatDisconnectedFor(7_384_000)).toBe('2:03:04')
    })
})

// Source-level, in the style of chartTeardown.spec.ts: DeviceStore needs the real
// SSE stream, i18n and several stores to exercise, and nothing else would catch a
// watchdog that is never fed. Unfed, it pins the overlay on permanently.
describe('watchdog wiring', () => {
    it('feeds the watchdog from the SSE status handler', () => {
        const sources = Object.values(deviceStoreSource)
        expect(sources).toHaveLength(1)
        expect(sources[0]).toContain('daemonState.noteStatusReceived()')
    })
})
