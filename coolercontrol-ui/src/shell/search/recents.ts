// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Recently opened palette destinations, per client. localStorage rather than
// the daemon's UI settings: this is browser-local history, of no interest to
// another machine pointed at the same daemon, and the daemon has no business
// storing it. Same reasoning as the locale cache and the connection settings.
//
// Only ids are stored. A device that is unplugged, a profile that is deleted or
// a plugin that is unloaded simply stops resolving and drops out silently.

const KEY = 'search-recents'
export const RECENTS_LIMIT = 6

function read(): string[] {
    try {
        const raw = localStorage.getItem(KEY)
        if (raw == null) return []
        const parsed: unknown = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed.filter((id): id is string => typeof id === 'string').slice(0, RECENTS_LIMIT)
    } catch (_) {
        // Corrupt or unavailable storage is not worth failing the palette over.
        return []
    }
}

/** Stored ids, most recent first. */
export function recentIds(): string[] {
    return read()
}

/** Moves `id` to the front, capping the list. */
export function rememberRecent(id: string): void {
    const next = [id, ...read().filter((existing) => existing !== id)].slice(0, RECENTS_LIMIT)
    try {
        localStorage.setItem(KEY, JSON.stringify(next))
    } catch (_) {
        // Private mode or a full quota: recents are a convenience, not a feature.
    }
}

export function clearRecents(): void {
    try {
        localStorage.removeItem(KEY)
    } catch (_) {
        // As above.
    }
}
