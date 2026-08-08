// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shareable custom-theme codes.
 *
 * `cct2:` + one 6-hex RGB triple per token in `THEME_TOKEN_KEYS` order + a
 * 2-hex CRC-8. Output always carries the checksum; input takes it either way,
 * so a code stays retypable by hand.
 *
 * `cct1:` codes predate the status colors and carry only the first six tokens.
 * They still decode, which is why the token order is append-only.
 */

import { THEME_TOKEN_KEYS, type ThemeTokens } from '@/shell/themes.ts'

/** Every theme token as `#rrggbb`. */
export type ThemeHexTokens = Record<keyof ThemeTokens, string>

const PREFIX = 'cct2:'
const LEGACY_PREFIX = 'cct1:'
const LEGACY_KEYS = THEME_TOKEN_KEYS.slice(0, 6)
const HEX_PER_TOKEN = 6

const crc8 = (bytes: Uint8Array): number => {
    let crc = 0
    for (const byte of bytes) {
        crc ^= byte
        for (let i = 0; i < 8; i++) {
            crc = (crc & 0x80) !== 0 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff
        }
    }
    return crc
}

const hexBodyToBytes = (hex: string): Uint8Array => {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    }
    return bytes
}

const checksum = (hex: string): string => crc8(hexBodyToBytes(hex)).toString(16).padStart(2, '0')

export const encodeThemeCode = (theme: ThemeHexTokens): string => {
    const hex = THEME_TOKEN_KEYS.map((key) => {
        const value = theme[key].toLowerCase()
        return value.startsWith('#') ? value.slice(1) : value
    }).join('')
    return PREFIX + hex + checksum(hex)
}

/** Strips an optional CRC-8 suffix, rejecting a body that fails it. */
const bodyOf = (body: string, hexLength: number): string | null => {
    const pattern = new RegExp(`^[0-9a-f]{${hexLength}}$`)
    if (body.length === hexLength) return pattern.test(body) ? body : null
    if (body.length !== hexLength + 2) return null
    const hex = body.slice(0, hexLength)
    if (!pattern.test(hex)) return null
    return checksum(hex) === body.slice(hexLength) ? hex : null
}

/**
 * The tokens a code carries, or null when it is not a valid code. A `cct1`
 * code omits everything after the sixth token; the caller fills those from
 * whatever it considers the default.
 */
export const decodeThemeCode = (input: string): Partial<ThemeHexTokens> | null => {
    const trimmed = input.trim().toLowerCase()
    const legacy = trimmed.startsWith(LEGACY_PREFIX)
    if (!legacy && !trimmed.startsWith(PREFIX)) return null
    const keys = legacy ? LEGACY_KEYS : THEME_TOKEN_KEYS
    const hex = bodyOf(trimmed.slice(PREFIX.length), keys.length * HEX_PER_TOKEN)
    if (hex == null) return null
    const decoded: Partial<ThemeHexTokens> = {}
    keys.forEach((key, index) => {
        decoded[key] = '#' + hex.slice(index * HEX_PER_TOKEN, (index + 1) * HEX_PER_TOKEN)
    })
    return decoded
}
