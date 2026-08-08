// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

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

// Target for a channel listed by the Monitoring section itself. A fan stays on
// its full chart here instead of being thrown over to Cooling, which keeps the
// section and its panel in step; DashboardView carries the companion link to the
// Cooling page. Everything else, custom sensors included, keeps the canonical
// target, so their editor stays one click away. Shortcut surfaces (pinned rows,
// the Home panel) stay on `channelRoute`.
export function monitoringChannelRoute(
    devices: Iterable<Device>,
    deviceUID: UID,
    channelName: string,
): RouteLocationRaw {
    for (const device of devices) {
        if (device.uid !== deviceUID) continue
        if (device.type === DeviceType.CUSTOM_SENSORS) break
        if (device.info?.channels.get(channelName)?.speed_options != null) {
            return { name: 'monitoring-sensor', params: { deviceUID, channelName } }
        }
        break
    }
    return channelRoute(devices, deviceUID, channelName)
}
