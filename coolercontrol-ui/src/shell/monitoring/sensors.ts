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

import { type Device, DeviceType, type UID } from '@/models/Device.ts'

export interface MonitoringSensor {
    deviceUID: UID
    channelName: string
    isTemp: boolean
}

export interface MonitoringDeviceGroup {
    deviceUID: UID
    sensors: MonitoringSensor[]
}

// The Monitoring sensor tree: temps plus all value-bearing channels including
// fans (duty/rpm are monitored too); lighting/LCD belong to Devices.
// Custom sensors get their own group via customSensors() below.
export function monitoringSensors(devices: Iterable<Device>): MonitoringDeviceGroup[] {
    const groups: MonitoringDeviceGroup[] = []
    for (const device of devices) {
        if (device.info == null || device.type === DeviceType.CUSTOM_SENSORS) continue
        const sensors: MonitoringSensor[] = []
        for (const tempName of device.info.temps.keys()) {
            sensors.push({ deviceUID: device.uid, channelName: tempName, isTemp: true })
        }
        for (const [channelName, channelInfo] of device.info.channels.entries()) {
            if (channelInfo.lighting_modes.length > 0 || channelInfo.lcd_info != null) {
                continue
            }
            sensors.push({ deviceUID: device.uid, channelName, isTemp: false })
        }
        if (sensors.length > 0) {
            groups.push({ deviceUID: device.uid, sensors })
        }
    }
    return groups
}

// Custom sensors are the temps of the CustomSensors device(s).
export function customSensors(devices: Iterable<Device>): MonitoringSensor[] {
    const sensors: MonitoringSensor[] = []
    for (const device of devices) {
        if (device.type !== DeviceType.CUSTOM_SENSORS || device.info == null) continue
        for (const tempName of device.info.temps.keys()) {
            sensors.push({ deviceUID: device.uid, channelName: tempName, isTemp: true })
        }
    }
    return sensors
}
