// SPDX-FileCopyrightText: 2022 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import type { UID } from '@/models/Device'

export interface ChannelStats {
    min: number
    max: number
    avg: number
    count: number
}

// Wire discriminator from the daemon's ChannelDataType (SCREAMING_SNAKE_CASE).
// Temps are tracked separately under `temps` and so are not represented here.
export type ChannelStatField = 'DUTY' | 'RPM' | 'FREQ' | 'WATTS'

export interface DeviceStatsDTO {
    uid: UID
    temps: Record<string, ChannelStats>
    channels: Record<string, Partial<Record<ChannelStatField, ChannelStats>>>
}

export interface StatsResponseDTO {
    devices: DeviceStatsDTO[]
}

export function defaultStatsResponse(): StatsResponseDTO {
    return { devices: [] }
}
