// SPDX-FileCopyrightText: 2022 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

export interface AccessTokenInfo {
    id: string
    label: string
    created_at: string
    expires_at: string | null
    last_used: string | null
    write_access: boolean
}

export interface CreateTokenRequest {
    label: string
    expires_at: string | null
    write_access: boolean
}

export interface CreateTokenResponse {
    id: string
    label: string
    token: string
    created_at: string
    expires_at: string | null
    write_access: boolean
}
