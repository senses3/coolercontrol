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

import type { RouteLocationRaw } from 'vue-router'
import { type Device, DeviceType, type UID } from '@/models/Device.ts'

// Canonical page for a channel/sensor, entity-first: the same target no matter
// which section links to it. Custom sensors edit under Devices; fan/pump
// channels (speed_options) live on their Cooling page, which embeds the same
// chart; everything else is a read-only sensor chart under Monitoring.
export function channelRoute(
    devices: Iterable<Device>,
    deviceUID: UID,
    channelName: string,
): RouteLocationRaw {
    for (const device of devices) {
        if (device.uid !== deviceUID) continue
        if (device.type === DeviceType.CUSTOM_SENSORS) {
            return { name: 'device-custom-sensor', params: { customSensorID: channelName } }
        }
        if (device.info?.channels.get(channelName)?.speed_options != null) {
            return { name: 'cooling-channel', params: { deviceUID, channelName } }
        }
        break
    }
    return { name: 'monitoring-sensor', params: { deviceUID, channelName } }
}
