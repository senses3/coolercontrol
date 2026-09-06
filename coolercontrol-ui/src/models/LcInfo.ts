// SPDX-FileCopyrightText: 2022 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { LcDriverType } from '@/models/LcDriverType'

export class LcInfo {
    readonly driver_type: LcDriverType
    readonly firmware_version: string
    readonly unknown_asetek: boolean

    constructor(driver_type: LcDriverType, firmware_version: string, unknown_asetek: boolean) {
        this.driver_type = driver_type
        this.firmware_version = firmware_version
        this.unknown_asetek = unknown_asetek
    }
}
