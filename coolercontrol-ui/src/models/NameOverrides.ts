// SPDX-FileCopyrightText: 2022 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import type { UID } from '@/models/Device'

/**
 * The daemon's sparse user-defined name overrides document (overrides.toml).
 * Devices and channels without an override are absent.
 */
export interface NameOverrides {
    devices: Record<UID, DeviceNameOverrides>
}

export interface DeviceNameOverrides {
    /** Daemon-written detected-name hint for hand-editors. */
    device_name?: string
    /** The user-defined device display name. */
    name?: string
    channels?: Record<string, ChannelNameOverrides>
}

export interface ChannelNameOverrides {
    /** Daemon-written detected-label hint (what a reset returns to). */
    channel_label?: string
    /** The user-defined channel display label. */
    label?: string
}
