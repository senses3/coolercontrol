/*
 * CoolerControl - monitor and control your cooling and other devices
 * Copyright (c) 2021-2025  Guy Boldon and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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

// Sorts a store entity array in place by a group's persisted order (legacy
// behavior: the profiles/functions arrays themselves carry the user order).
export function sortEntitiesByGroup<T>(
    menuOrder: MenuOrderIds[],
    groupId: string,
    entities: T[],
    idOf: (item: T) => string,
): void {
    const entry = menuOrder.find((item) => item.id === groupId)
    if (!entry?.children?.length) return
    const getIndex = (item: T): number => {
        const index = entry.children.indexOf(idOf(item))
        return index >= 0 ? index : Number.MAX_SAFE_INTEGER
    }
    entities.sort((a, b) => getIndex(a) - getIndex(b))
}
