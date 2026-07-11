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
    mdiChip,
    mdiCpu64Bit,
    mdiExpansionCard,
    mdiFlaskRoundBottom,
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
            return mdiChip
        case DeviceType.CUSTOM_SENSORS:
            return mdiFlaskRoundBottom
        case DeviceType.SERVICE_PLUGIN:
            return mdiPuzzle
        default:
            return mdiMemory
    }
}
