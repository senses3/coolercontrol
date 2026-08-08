// SPDX-FileCopyrightText: 2022 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

export class SpeedOptions {
    constructor(
        readonly min_duty: number = 0,
        readonly max_duty: number = 100,
        readonly fixed_enabled: boolean = false,
        readonly extension?: ChannelExtensionNames,
    ) {}
}

export enum ChannelExtensionNames {
    AutoHWCurve = 'AutoHWCurve',
    AmdRdnaGpu = 'AmdRdnaGpu',
}
