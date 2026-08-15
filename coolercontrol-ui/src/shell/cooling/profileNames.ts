// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Names for profiles forked from an existing one.
 *
 * A fork carries the source name so the profile list still says what the curve
 * is for, plus a qualifier that both distinguishes it from the source and says
 * why it exists: the channel it now serves, or the calibration its duties were
 * converted for. The qualifier is load-bearing, not decoration: the daemon does
 * not enforce unique names, so without it the picker shows two identical rows.
 */

/** The daemon rejects names over 50 bytes (`api::validate_name_string`). */
export const MAX_NAME_BYTES = 50

const ELLIPSIS = '…'

const byteLength = (value: string): number => new TextEncoder().encode(value).length

/**
 * Truncates to at most `budget` UTF-8 bytes, cutting on a code point boundary
 * and marking the cut. Bytes, not characters, because that is what the daemon
 * counts: 50 CJK characters are 150 of them.
 */
function trimToBytes(value: string, budget: number): string {
    if (byteLength(value) <= budget) return value
    const room = budget - byteLength(ELLIPSIS)
    if (room <= 0) return ''
    let kept = ''
    let used = 0
    for (const char of value) {
        const size = byteLength(char)
        if (used + size > room) break
        kept += char
        used += size
    }
    const trimmed = kept.trimEnd()
    return trimmed.length > 0 ? `${trimmed}${ELLIPSIS}` : ''
}

/**
 * `"<source> <suffix>"` within the daemon's limit. The source name gives way
 * first: the qualifier is what makes the name unique, so cutting it would defeat
 * the naming. A save that overruns the limit fails silently, so this must fit.
 */
export function fitProfileName(sourceName: string, suffix: string): string {
    const room = MAX_NAME_BYTES - byteLength(suffix)
    if (room <= 0) return trimToBytes(`${sourceName}${suffix}`, MAX_NAME_BYTES)
    const source = trimToBytes(sourceName, room)
    return source.length > 0 ? `${source}${suffix}` : suffix.trimStart()
}
