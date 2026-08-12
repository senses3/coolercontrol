// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Never below this, whatever the poll rate: a mobile connection drops for a
// second or two routinely, and those must stay invisible.
export const CONNECTION_LOST_FLOOR_MS = 10_000
// Missing this many status ticks in a row is not jitter.
export const CONNECTION_LOST_MISSED_TICKS = 3
// The daemon clamps poll_rate to this range (api/settings.rs), so the threshold
// lands between 10s and 15s no matter what a stale or hand-edited config holds.
export const POLL_RATE_MIN_SECONDS = 0.5
export const POLL_RATE_MAX_SECONDS = 5

export function connectionLostThresholdMs(pollRateSeconds: number): number {
    if (!Number.isFinite(pollRateSeconds)) return CONNECTION_LOST_FLOOR_MS
    const pollRate = Math.min(
        Math.max(pollRateSeconds, POLL_RATE_MIN_SECONDS),
        POLL_RATE_MAX_SECONDS,
    )
    return Math.max(CONNECTION_LOST_FLOOR_MS, CONNECTION_LOST_MISSED_TICKS * pollRate * 1_000)
}

export function isConnectionLost(elapsedMs: number, thresholdMs: number): boolean {
    return elapsedMs > thresholdMs
}

/** Digits only (h:mm:ss past an hour), so no unit words need translating. */
export function formatDisconnectedFor(elapsedMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1_000))
    const seconds = totalSeconds % 60
    const minutes = Math.floor(totalSeconds / 60) % 60
    const hours = Math.floor(totalSeconds / 3_600)
    const paddedSeconds = seconds.toString().padStart(2, '0')
    if (hours === 0) return `${minutes}:${paddedSeconds}`
    return `${hours}:${minutes.toString().padStart(2, '0')}:${paddedSeconds}`
}
