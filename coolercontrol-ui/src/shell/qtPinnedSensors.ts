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

// The tray shows the sensors the user pinned, so a glance at the menu answers "what are
// my temps doing" without reopening the window. Qt cannot ask the SPA for the values:
// once the window is in the tray the renderer is discarded. So the SPA pushes only the
// identity and label of each pin, and Qt fetches the readings itself.
//
// Only sensor pins are pushed. `pinnedIds` also holds dashboard UIDs, which are
// distinguished here by matching against the known sensor set rather than by guessing
// at the id format.

import type { Device, UID } from '@/models/Device'
import { monitoringSensors } from '@/shell/monitoring/sensors.ts'
import { pinId } from '@/shell/cooling/channels.ts'

/** Kept small so opening the menu is a bounded burst of requests, not a fan-out. */
export const MAX_TRAY_SENSORS = 5

export interface QtPinnedSensor {
    deviceUid: UID
    channelName: string
    label: string
    isTemp: boolean
}

export function buildPinnedSensors(
    devices: Iterable<Device>,
    pinnedIds: string[],
    label: (deviceUid: UID, channelName: string) => string,
): QtPinnedSensor[] {
    const known = new Map<string, { deviceUID: UID; channelName: string; isTemp: boolean }>()
    for (const group of monitoringSensors(devices)) {
        for (const sensor of group.sensors) {
            known.set(pinId(sensor.deviceUID, sensor.channelName), sensor)
        }
    }
    // pinnedIds order is the user's chosen order, so preserve it.
    return pinnedIds
        .map((id) => known.get(id))
        .filter((s): s is NonNullable<typeof s> => s != null)
        .slice(0, MAX_TRAY_SENSORS)
        .map((s) => ({
            deviceUid: s.deviceUID,
            channelName: s.channelName,
            label: label(s.deviceUID, s.channelName),
            isTemp: s.isTemp,
        }))
}
