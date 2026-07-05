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
