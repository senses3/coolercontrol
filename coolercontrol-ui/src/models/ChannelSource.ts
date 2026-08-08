// SPDX-FileCopyrightText: 2022 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { UID } from '@/models/Device.ts'
import i18n from '@/i18n'

export class ChannelSource {
    // The associated device uid containing current values
    device_uid: UID

    /// The internal name for this channel source. NOT the Label.
    channel_name: string

    channel_metric: ChannelMetric

    constructor(device_uid: UID, channel_name: string, channel_metric: ChannelMetric) {
        this.device_uid = device_uid
        this.channel_name = channel_name
        this.channel_metric = channel_metric
    }
}

export enum ChannelMetric {
    Temp = 'Temp',
    Duty = 'Duty',
    Load = 'Load',
    RPM = 'RPM',
    Freq = 'Freq',
}

/**
 * 获取ChannelMetric的本地化显示名称
 * @param metric ChannelMetric枚举值
 * @returns 本地化的显示名称
 */
export function getChannelMetricDisplayName(metric: ChannelMetric): string {
    const { t } = i18n.global
    switch (metric) {
        case ChannelMetric.Temp:
            return t('models.dataType.temp')
        case ChannelMetric.Duty:
            return t('models.dataType.duty')
        case ChannelMetric.Load:
            return t('models.dataType.load')
        case ChannelMetric.RPM:
            return t('models.dataType.rpm')
        case ChannelMetric.Freq:
            return t('models.dataType.freq')
        default:
            return String(metric)
    }
}
