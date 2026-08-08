// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Device, UID } from '@/models/Device.ts'

export interface CoolingChannel {
    deviceUID: UID
    channelName: string
    controllable: boolean
    minDuty: number
    maxDuty: number
}

export interface CoolingDeviceGroup {
    deviceUID: UID
    channels: CoolingChannel[]
}

// A channel is a fan/pump channel iff it has speed_options; it is controllable
// iff speed_options.fixed_enabled. Same structural rule as the legacy tree.
export function coolingChannels(devices: Iterable<Device>): CoolingDeviceGroup[] {
    const groups: CoolingDeviceGroup[] = []
    for (const device of devices) {
        if (device.info == null) continue
        const channels: CoolingChannel[] = []
        for (const [channelName, channelInfo] of device.info.channels.entries()) {
            if (channelInfo.speed_options == null) continue
            channels.push({
                deviceUID: device.uid,
                channelName,
                controllable: channelInfo.speed_options.fixed_enabled ?? false,
                minDuty: channelInfo.speed_options.min_duty,
                maxDuty: channelInfo.speed_options.max_duty,
            })
        }
        if (channels.length > 0) {
            groups.push({ deviceUID: device.uid, channels })
        }
    }
    return groups
}

// Pinned-item id, identical to the legacy tree's format so pins are shared.
export function pinId(deviceUID: UID, channelName: string): string {
    return `${deviceUID}_${channelName}`
}
