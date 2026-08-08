// SPDX-FileCopyrightText: 2023 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { Type } from 'class-transformer'
import { Device, DeviceType, type TypeIndex, type UID } from '@/models/Device'
import { Status } from '@/models/Status'

export class DeviceResponseDTO {
    @Type(() => Device)
    public devices: Device[]

    constructor(devices: Device[] = []) {
        this.devices = devices
    }
}

export class StatusResponseDTO {
    @Type(() => DeviceStatusDTO)
    devices: DeviceStatusDTO[]

    constructor(devices: DeviceStatusDTO[]) {
        this.devices = devices
    }
}

export class DeviceStatusDTO {
    uid: UID
    type: DeviceType
    type_index: TypeIndex

    @Type(() => Status)
    status_history: Status[]

    constructor(type: DeviceType, type_index: TypeIndex, uid: UID, status_history: Status[]) {
        this.type = type
        this.type_index = type_index
        this.uid = uid
        this.status_history = status_history
    }
}
