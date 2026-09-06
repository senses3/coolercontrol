// SPDX-FileCopyrightText: 2022 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

export class ErrorResponse {
    status?: number

    constructor(readonly error: string) {}
}
