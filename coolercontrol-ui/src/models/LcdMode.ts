// SPDX-FileCopyrightText: 2022 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import i18n from '@/i18n'

export enum LcdModeType {
    NONE = 'None',
    LC = 'Liquidctl',
    CUSTOM = 'Custom',
}

/**
 * 获取LcdModeType的本地化显示名称
 * @param type LcdModeType枚举值
 * @returns 本地化的显示名称
 */
export function getLcdModeTypeDisplayName(type: LcdModeType): string {
    const { t } = i18n.global
    switch (type) {
        case LcdModeType.NONE:
            return t('models.lcdModeType.none')
        case LcdModeType.LC:
            return t('models.lcdModeType.liquidctl')
        case LcdModeType.CUSTOM:
            return t('models.lcdModeType.custom')
        default:
            return String(type)
    }
}

export class LcdMode {
    constructor(
        readonly name: string,
        readonly frontend_name: string,
        readonly brightness: boolean,
        readonly orientation: boolean,
        readonly image: boolean = false,
        readonly colors_min: number = 0,
        readonly colors_max: number = 0,
        readonly type: LcdModeType = LcdModeType.LC,
    ) {}
}
