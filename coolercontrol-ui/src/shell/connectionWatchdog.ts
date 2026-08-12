// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Status ticks arrive once a second, so this is roughly ten missed ones: long
// enough to ride out a mobile connection blip, short enough that stale readings
// are not mistaken for live ones.
export const CONNECTION_LOST_GRACE_MS = 10_000

export function isConnectionLost(elapsedMs: number): boolean {
    return elapsedMs > CONNECTION_LOST_GRACE_MS
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
