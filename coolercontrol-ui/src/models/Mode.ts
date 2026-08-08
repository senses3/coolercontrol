// SPDX-FileCopyrightText: 2022 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import type { UID } from '@/models/Device.ts'
import { DeviceSettingReadDTO } from '@/models/DaemonSettings.ts'
import { Type } from 'class-transformer'

export class Mode {
    uid: UID

    name: string

    @Type(() => DeviceSettingReadDTO)
    device_settings: Array<[UID, Array<DeviceSettingReadDTO>]> = []

    constructor(
        uid: UID,
        name: string,
        device_settings: Array<[UID, Array<DeviceSettingReadDTO>]>,
    ) {
        this.uid = uid
        this.name = name
        this.device_settings = device_settings
    }
}

export class ModesDTO {
    @Type(() => Mode)
    modes: Array<Mode> = []
}

export class ModeOrderDTO {
    mode_uids: Array<UID> = []
}

export class UpdateModeDTO {
    uid: UID
    name: string

    constructor(uid: UID, name: string) {
        this.uid = uid
        this.name = name
    }
}

export class CreateModeDTO {
    name: string

    constructor(name: string) {
        this.name = name
    }
}

export class ActiveModeDTO {
    current_mode_uid?: UID
    previous_mode_uid?: UID
}

export class ModeActivated {
    uid?: UID
    name?: string
    previous_uid?: UID

    constructor(uid: UID, name: string) {
        this.uid = uid
        this.name = name
    }
}
