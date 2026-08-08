// SPDX-FileCopyrightText: 2023 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { SpeedOptions } from '@/models/SpeedOptions'
import { LightingMode } from '@/models/LightingMode'
import { LcdMode } from '@/models/LcdMode'
import { Type } from 'class-transformer'
import { LcdInfo } from '@/models/LcdInfo'

export class ChannelInfo {
    readonly label?: string

    @Type(() => SpeedOptions)
    readonly speed_options?: SpeedOptions

    @Type(() => LightingMode)
    readonly lighting_modes: LightingMode[] = []

    @Type(() => LcdMode)
    readonly lcd_modes: LcdMode[] = []

    @Type(() => LcdInfo)
    readonly lcd_info?: LcdInfo

    constructor(
        label?: string,
        speed_options?: SpeedOptions,
        lighting_modes: LightingMode[] = [],
        lcd_modes: LcdMode[] = [],
        lcd_info?: LcdInfo,
    ) {
        this.label = label
        this.lcd_modes = lcd_modes
        this.lighting_modes = lighting_modes
        this.speed_options = speed_options
        this.lcd_info = lcd_info
    }
}
