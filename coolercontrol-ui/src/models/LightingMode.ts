// SPDX-FileCopyrightText: 2022 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

export enum LightingModeType {
    NONE = 'None',
    LC = 'Liquidctl',
    CUSTOM = 'Custom',
}

export class LightingMode {
    constructor(
        readonly name: string,
        readonly frontend_name: string,
        readonly min_colors: number,
        readonly max_colors: number,
        readonly speed_enabled: boolean,
        readonly backward_enabled: boolean,
        readonly type: LightingModeType = LightingModeType.LC,
    ) {}
}
