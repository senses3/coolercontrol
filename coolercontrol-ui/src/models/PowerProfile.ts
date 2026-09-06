// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import type { UID } from '@/models/Device.ts'

/**
 * The system power profile state the daemon observes, plus the profile to Mode mapping.
 *
 * `available` is empty when no power profile daemon (power-profiles-daemon or the tuned-ppd
 * shim) is reachable over D-Bus, which is how the UI decides whether to offer the feature.
 */
export class PowerProfileStateDTO {
    available: Array<string> = []

    active: string | null = null

    modes: Record<string, UID> = {}
}

export class PowerProfileModesDTO {
    modes: Record<string, UID> = {}

    constructor(modes: Record<string, UID> = {}) {
        this.modes = modes
    }
}

/** A system state change the daemon publishes on the SSE `system` event. */
export class SystemEventDTO {
    kind: string = ''

    value: string = ''

    previous: string | null = null
}
