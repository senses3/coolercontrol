// SPDX-FileCopyrightText: 2023 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { DeviceInfo } from '@/models/DeviceInfo'
import { LcInfo } from '@/models/LcInfo'
import { Status } from '@/models/Status'
import { Type } from 'class-transformer'
import i18n from '@/i18n'

export enum DeviceType {
    CUSTOM_SENSORS = 'CustomSensors',
    CPU = 'CPU',
    GPU = 'GPU',
    LIQUIDCTL = 'Liquidctl',
    HWMON = 'Hwmon',
    SERVICE_PLUGIN = 'ServicePlugin',
}

/**
 * 获取DeviceType的本地化显示名称
 * @param type DeviceType枚举值
 * @returns 本地化的显示名称
 */
export function getDeviceTypeDisplayName(type: DeviceType): string {
    const { t } = i18n.global
    switch (type) {
        case DeviceType.CUSTOM_SENSORS:
            return t('models.deviceType.customSensors')
        case DeviceType.CPU:
            return t('models.deviceType.cpu')
        case DeviceType.GPU:
            return t('models.deviceType.gpu')
        case DeviceType.LIQUIDCTL:
            return t('models.deviceType.liquidctl')
        case DeviceType.HWMON:
            return t('models.deviceType.hwmon')
        case DeviceType.SERVICE_PLUGIN:
            return t('models.deviceType.servicePlugin')
        default:
            return String(type)
    }
}

export type UID = string
export type TypeIndex = number
export type Color = string

export class Device {
    public readonly uid: UID
    public readonly name: string
    public readonly type: DeviceType
    public readonly type_index: TypeIndex

    @Type(() => LcInfo)
    public readonly lc_info?: LcInfo

    @Type(() => DeviceInfo)
    public readonly info?: DeviceInfo

    @Type(() => Status)
    public status_history: Array<Status> = []

    constructor(
        uid: UID,
        name: string,
        type: DeviceType,
        type_index: TypeIndex,
        lc_info?: LcInfo,
        info?: DeviceInfo,
        status_history: Status[] = [],
    ) {
        this.status_history = status_history
        this.info = info
        this.lc_info = lc_info
        this.type_index = type_index
        this.type = type
        this.name = name
        this.uid = uid
    }

    get nameShort(): string {
        return this.name.split(' (')[0]
    }

    get status(): Status {
        // @ts-ignore
        return this.status_history[this.status_history.length - 1]
    }

    set status(status: Status) {
        this.status_history.push(status)
    }
}
