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

import {
    mdiFan,
    mdiLightningBoltCircle,
    mdiSineWave,
    mdiSpeedometer,
    mdiThermometer,
} from '@mdi/js'
import type { Device } from '@/models/Device.ts'
import type { ChannelValues } from '@/stores/DeviceStore.ts'

export type ChannelKind = 'temp' | 'fan' | 'load' | 'freq' | 'power'

// Kind comes from device metadata (temps, speed_options) and, for the remaining
// sensors, the reported value field. Failsafed/stale sensors keep reporting
// values, so field-based classification stays stable without flicker.
export function channelKind(
    device: Device | undefined,
    channelName: string,
    values?: ChannelValues,
): ChannelKind {
    if (device?.info?.temps.has(channelName)) return 'temp'
    if (device?.info?.channels.get(channelName)?.speed_options != null) return 'fan'
    if (values?.freq != null) return 'freq'
    if (values?.watts != null) return 'power'
    return 'load'
}

const KIND_ICONS: Record<ChannelKind, string> = {
    temp: mdiThermometer,
    fan: mdiFan,
    load: mdiSpeedometer,
    freq: mdiSineWave,
    power: mdiLightningBoltCircle,
}

export function channelKindIcon(kind: ChannelKind): string {
    return KIND_ICONS[kind]
}

// Fans spin under Eye Candy when actually moving (rpm when reported, else duty).
export function channelSpins(
    kind: ChannelKind,
    values: ChannelValues | undefined,
    eyeCandy: boolean,
): boolean {
    if (!eyeCandy || kind !== 'fan') return false
    return values?.rpm != null ? Number(values.rpm) > 0 : Number(values?.duty ?? 0) > 0
}
