// SPDX-FileCopyrightText: 2022 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import {
    mdiCpu64Bit,
    mdiExpansionCard,
    mdiFlaskRoundBottom,
    mdiLinux,
    mdiMemory,
    mdiPuzzle,
    mdiWater,
} from '@mdi/js'
import { DeviceType } from '@/models/Device.ts'

export function deviceTypeIcon(type: DeviceType): string {
    switch (type) {
        case DeviceType.CPU:
            return mdiCpu64Bit
        case DeviceType.GPU:
            return mdiExpansionCard
        case DeviceType.LIQUIDCTL:
            return mdiWater
        case DeviceType.HWMON:
            return mdiLinux
        case DeviceType.CUSTOM_SENSORS:
            return mdiFlaskRoundBottom
        case DeviceType.SERVICE_PLUGIN:
            return mdiPuzzle
        default:
            return mdiMemory
    }
}
