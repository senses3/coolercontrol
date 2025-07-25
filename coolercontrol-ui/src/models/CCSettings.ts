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

import type { UID } from '@/models/Device'
import { Type } from 'class-transformer'

/**
 * General settings specific to CoolerControl
 */
export class CoolerControlSettingsDTO {
    apply_on_boot: boolean = true
    no_init: boolean = false
    startup_delay: number = 2
    thinkpad_full_speed: boolean = false
    hide_duplicate_devices: boolean = true
    liquidctl_integration: boolean = true
    compress: boolean = false
    poll_rate: number = 1.0
    drivetemp_suspend: boolean = false
}

/**
 * General settings specific to CoolerControl that affect specific devices
 */
export class CoolerControlDeviceSettingsDTO {
    uid: UID
    name: string
    disable: boolean = false
    disable_channels: Array<string> = []

    constructor(uid: UID, name: string, disable_channels: Array<string> = []) {
        this.uid = uid
        this.name = name
        this.disable_channels = disable_channels
    }
}

export class CoolerControlAllDeviceSettingsDTO {
    @Type(() => CoolerControlDeviceSettingsDTO)
    devices: Array<CoolerControlDeviceSettingsDTO> = []
}
