// SPDX-FileCopyrightText: 2022 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

export class LcdInfo {
    constructor(
        readonly screen_width: number,
        readonly screen_height: number,
        readonly max_image_size_bytes: number,
        readonly gif_supported: boolean,
    ) {}
}
