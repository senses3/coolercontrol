// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// One flat level of user-named folders over the Cooling panel's Profiles and
// Functions lists, stored in `menuOrder`: a group's children interleave entity
// uids with folder ids, and each folder id gets its own entry.
//
//   { id: 'profiles', children: ['uidA', 'pf:7c2e', 'uidB'] }
//   { id: 'pf:7c2e',  children: ['uidC', 'uidD'] }
//
// Root ids plus one uid list per folder, not a row tree: the drag layer moves
// the bound item itself, so rows would splice into a list of uids.

import { v4 as uuidV4 } from 'uuid'
import type { MenuOrderIds } from '@/models/UISettings.ts'
import { setGroupOrder } from '@/shell/panelOrder.ts'

export type LibraryKind = 'profiles' | 'functions'

export interface LibraryLists {
    // Entity uids and folder ids, in the order the panel shows them.
    rootIds: string[]
    // Folder id -> the entity uids it holds. Keyed for every folder in rootIds.
    folderChildren: Record<string, string[]>
}

// Prefixed per kind so a profile folder can never take a function.
const FOLDER_PREFIX: Record<LibraryKind, string> = {
    profiles: 'pf:',
    functions: 'fn:',
}

export function isFolderId(id: string): boolean {
    return Object.values(FOLDER_PREFIX).some((prefix) => id.startsWith(prefix))
}

export function isFolderIdOfKind(id: string, kind: LibraryKind): boolean {
    return id.startsWith(FOLDER_PREFIX[kind])
}

// crypto.randomUUID() is undefined outside a secure context, and the web UI is
// reached over plain http.
export function newFolderId(kind: LibraryKind): string {
    return `${FOLDER_PREFIX[kind]}${uuidV4()}`
}

// Unknown entities land at root, at the end. Duplicates keep their first
// mention, and ids without an entity are dropped.
export function buildLibraryLists(
    menuOrder: MenuOrderIds[],
    kind: LibraryKind,
    uids: string[],
): LibraryLists {
    const unclaimed = new Set(uids)
    const claim = (uid: string): boolean => unclaimed.delete(uid)
    const rootIds: string[] = []
    const folderChildren: Record<string, string[]> = {}
    for (const id of menuOrder.find((entry) => entry.id === kind)?.children ?? []) {
        if (isFolderId(id)) {
            if (id in folderChildren) continue
            const children = menuOrder.find((entry) => entry.id === id)?.children ?? []
            folderChildren[id] = children.filter(claim)
            rootIds.push(id)
        } else if (claim(id)) {
            rootIds.push(id)
        }
    }
    for (const uid of uids) {
        if (unclaimed.has(uid)) rootIds.push(uid)
    }
    return { rootIds, folderChildren }
}

// Assign the result back to the store ref: the save watcher fires on whole-array
// replacement only. Folders this write does not know about are kept, since UI
// settings save as one blob and another client's copy may predate them.
export function persistLibraryLists(
    menuOrder: MenuOrderIds[],
    kind: LibraryKind,
    lists: LibraryLists,
): MenuOrderIds[] {
    const known = new Set(lists.rootIds)
    const unknown = menuOrder
        .filter((entry) => isFolderIdOfKind(entry.id, kind) && !known.has(entry.id))
        .map((entry) => entry.id)
    let next = setGroupOrder(menuOrder, kind, [...lists.rootIds, ...unknown])
    for (const id of lists.rootIds.filter(isFolderId)) {
        next = setGroupOrder(next, id, lists.folderChildren[id] ?? [])
    }
    return next
}

// Call before persisting, so the write above does not read the entry back.
export function removeFolderEntry(menuOrder: MenuOrderIds[], folderId: string): MenuOrderIds[] {
    return menuOrder.filter((entry) => entry.id !== folderId)
}

// Top to bottom, folders expanded in place.
export function flatLibraryOrder(menuOrder: MenuOrderIds[], kind: LibraryKind): string[] {
    const order: string[] = []
    const seen = new Set<string>()
    const push = (uid: string): void => {
        if (seen.has(uid)) return
        seen.add(uid)
        order.push(uid)
    }
    for (const id of menuOrder.find((entry) => entry.id === kind)?.children ?? []) {
        if (isFolderId(id)) {
            for (const uid of menuOrder.find((entry) => entry.id === id)?.children ?? []) push(uid)
        } else {
            push(id)
        }
    }
    return order
}

// Sorts in place, like the flat-list helper it replaces. Unknown ids go last.
export function sortEntitiesByTree<T>(
    menuOrder: MenuOrderIds[],
    kind: LibraryKind,
    entities: T[],
    idOf: (item: T) => string,
): void {
    const order = flatLibraryOrder(menuOrder, kind)
    if (order.length === 0) return
    const indexOf = (item: T): number => {
        const index = order.indexOf(idOf(item))
        return index >= 0 ? index : Number.MAX_SAFE_INTEGER
    }
    entities.sort((a, b) => indexOf(a) - indexOf(b))
}

// Top of the list, next to the button, so a long list cannot hide it.
export function addFolder(lists: LibraryLists, id: string): LibraryLists {
    return {
        rootIds: [id, ...lists.rootIds],
        folderChildren: { ...lists.folderChildren, [id]: [] },
    }
}

// The folder's items take its slot, so nothing jumps elsewhere when unfiled.
export function removeFolder(lists: LibraryLists, folderId: string): LibraryLists {
    const { [folderId]: children, ...folderChildren } = lists.folderChildren
    return {
        rootIds: lists.rootIds.flatMap((id) => (id === folderId ? (children ?? []) : [id])),
        folderChildren,
    }
}

// An empty name drops the entry and falls back to the panel's default label.
export function setFolderName(
    names: Array<[string, string]>,
    id: string,
    name: string,
): Array<[string, string]> {
    const next = names.filter(([key]) => key !== id)
    if (name.length > 0) next.push([id, name])
    return next
}
