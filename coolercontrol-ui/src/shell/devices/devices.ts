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

// The Devices section lists hardware devices; custom sensors are Monitoring's.
export function hardwareDevices(devices: Iterable<Device>): Device[] {
    return [...devices].filter((device) => device.type !== DeviceType.CUSTOM_SENSORS)
}

export interface DeviceChannelLink {
    deviceUID: UID
    channelName: string
    kind: 'lighting' | 'lcd'
}

// Lighting and LCD channels get their own editor subpages.
export function deviceChannelLinks(device: Device): DeviceChannelLink[] {
    const links: DeviceChannelLink[] = []
    if (device.info == null) return links
    for (const [channelName, channelInfo] of device.info.channels.entries()) {
        if (channelInfo.lighting_modes.length > 0) {
            links.push({ deviceUID: device.uid, channelName, kind: 'lighting' })
        }
    }
    for (const [channelName, channelInfo] of device.info.channels.entries()) {
        if (channelInfo.lcd_modes.length > 0) {
            links.push({ deviceUID: device.uid, channelName, kind: 'lcd' })
        }
    }
    return links
}

export interface SensorToggle {
    channelName: string
    enabled: boolean
}

// Every toggleable sensor/channel of a device, mirroring the old settings
// tree: temps, freq/power/load channels, fan channels, lighting, LCD, plus
// currently-disabled channels persisted in the CC device settings.
export function sensorToggles(
    device: Device,
    disabledChannelNames: Iterable<string>,
): SensorToggle[] {
    const toggles: SensorToggle[] = []
    const seen = new Set<string>()
    const add = (channelName: string, enabled: boolean): void => {
        if (seen.has(channelName)) return
        seen.add(channelName)
        toggles.push({ channelName, enabled })
    }
    for (const temp of device.status.temps) {
        add(temp.name, true)
    }
    for (const keyword of ['freq', 'power', 'load']) {
        for (const channel of device.status.channels) {
            if (channel.name.toLowerCase().includes(keyword)) add(channel.name, true)
        }
    }
    if (device.info != null) {
        for (const [channelName, channelInfo] of device.info.channels.entries()) {
            if (channelInfo.speed_options != null) add(channelName, true)
        }
        for (const [channelName, channelInfo] of device.info.channels.entries()) {
            if (channelInfo.lighting_modes.length > 0) add(channelName, true)
        }
        for (const [channelName, channelInfo] of device.info.channels.entries()) {
            if (channelInfo.lcd_modes.length > 0) add(channelName, true)
        }
    }
    const disabled = [...disabledChannelNames].filter((name) => !seen.has(name))
    disabled.sort((a, b) => a.localeCompare(b))
    for (const channelName of disabled) {
        add(channelName, false)
    }
    return toggles
}
