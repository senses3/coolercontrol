// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Panel drag-order persistence on the legacy menuOrder structure, so orders
// saved by the old tree menu carry over unchanged: top-level entries are
// device UIDs (children `${uid}_${channel}`) plus the group ids 'dashboards',
// 'modes', 'profiles', 'functions', 'alerts' (children = entity uids).

import type { MenuOrderIds } from '@/models/UISettings.ts'

export function orderedByGroup<T>(
    menuOrder: MenuOrderIds[],
    groupId: string,
    items: T[],
    idOf: (item: T) => string,
): T[] {
    const entry = menuOrder.find((item) => item.id === groupId)
    if (!entry?.children?.length) return items
    const getIndex = (item: T): number => {
        const index = entry.children.indexOf(idOf(item))
        return index >= 0 ? index : Number.MAX_SAFE_INTEGER
    }
    return [...items].sort((a, b) => getIndex(a) - getIndex(b))
}

// Returns a new menuOrder with the group's children order upserted. Callers
// must assign the result back to the store ref: the UI-settings save watcher
// only fires on whole-array replacement, not on in-place mutation.
export function setGroupOrder(
    menuOrder: MenuOrderIds[],
    groupId: string,
    ids: string[],
): MenuOrderIds[] {
    const next = menuOrder.map((entry) =>
        entry.id === groupId ? { id: entry.id, children: ids } : entry,
    )
    if (!next.some((entry) => entry.id === groupId)) {
        next.push({ id: groupId, children: ids })
    }
    return next
}

// Reorders the top-level device entries to the given uid order, keeping
// non-listed entries (group ids, unknown devices) in their relative positions
// after the listed ones only if they were not already interleaved.
export function setTopLevelOrder(menuOrder: MenuOrderIds[], orderedUids: string[]): MenuOrderIds[] {
    const byId = new Map(menuOrder.map((entry) => [entry.id, entry]))
    const listed: MenuOrderIds[] = []
    for (const uid of orderedUids) {
        const entry = byId.get(uid)
        if (entry != null) {
            listed.push(entry)
            byId.delete(uid)
        } else {
            listed.push({ id: uid, children: [] })
        }
    }
    const rest = menuOrder.filter((entry) => byId.has(entry.id))
    return [...listed, ...rest]
}

// Reorders only the ids present in `subset` within `all`, preserving every
// other id's position. Used for pinned lists and per-device channel lists
// where a panel drags a filtered slice of a shared order.
export function reorderSubset(all: string[], subset: string[]): string[] {
    const set = new Set(subset)
    let next = 0
    return all.map((id) => (set.has(id) ? subset[next++] : id))
}

// Applies a dragged subset to a device's children order without losing ids
// the dragging panel does not display (e.g. cooling drags fans only, while
// the same list also orders temps for monitoring).
export function setDeviceChildrenSubset(
    menuOrder: MenuOrderIds[],
    deviceUID: string,
    subsetIds: string[],
    allIds: string[],
): MenuOrderIds[] {
    const entry = menuOrder.find((item) => item.id === deviceUID)
    const existing = (entry?.children ?? []).filter((id) => allIds.includes(id))
    const missing = allIds.filter((id) => !existing.includes(id))
    const base = [...existing, ...missing]
    return setGroupOrder(menuOrder, deviceUID, reorderSubset(base, subsetIds))
}

// Pinned rows in the order their ids were pinned, whatever kind each row is.
// A panel showing more than one kind must not group them: `pinnedIds` is one
// order, so grouping would put a newly pinned item above older ones and make a
// drag here mean something else in the panel next door. Ids with no row (a kind
// this panel does not show, or a deleted entity) drop out.
export function orderPinnedRows<T>(pinnedIds: string[], rowsById: Map<string, T>): T[] {
    const rows: T[] = []
    for (const id of pinnedIds) {
        const row = rowsById.get(id)
        if (row !== undefined) rows.push(row)
    }
    return rows
}

// Reorders only the devices a panel lists, leaving every other top-level entry
// (devices it does not list, the 'profiles'/'dashboards' group ids) exactly
// where it was. Cooling lists devices with controllable channels and Monitoring
// devices with sensors, so both drag a slice of the one device order.
export function reorderTopLevel(menuOrder: MenuOrderIds[], shownUids: string[]): MenuOrderIds[] {
    const byId = new Map(menuOrder.map((entry) => [entry.id, entry]))
    const base = [...menuOrder]
    for (const uid of shownUids) {
        if (byId.has(uid)) continue
        // A device the order has never seen goes on the end, as setTopLevelOrder
        // does, so its first drag has a slot to move within.
        const entry: MenuOrderIds = { id: uid, children: [] }
        byId.set(uid, entry)
        base.push(entry)
    }
    const ids = reorderSubset(
        base.map((entry) => entry.id),
        shownUids,
    )
    return ids.map((id) => byId.get(id) ?? { id, children: [] })
}
