// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// One flat level of user-named folders over the Profiles and Functions lists in
// the Cooling panel. Folders reuse `menuOrder` rather than adding a structure
// beside it: the group's children list interleaves entity uids with folder ids,
// and each folder id gets its own entry holding that folder's uids.
//
//   { id: 'profiles', children: ['uidA', 'pf:7c2e', 'uidB'] }
//   { id: 'pf:7c2e',  children: ['uidC', 'uidD'] }
//
// The panel works in the same shape, a root id list plus one uid list per
// folder, because the drag layer moves the bound item itself between the arrays
// it is given: a tree of row objects would splice a row into a list of uids on
// the first drop into a folder. Names live in `libraryFolderNames`, the one new
// UI setting. A config written before folders existed loads as every entity at
// root.

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

// Prefixed per kind so a profile folder can never take a function, whatever the
// drag layer allows, and so one group's cleanup leaves the other's entries be.
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

// uuid rather than crypto.randomUUID(), which is undefined outside a secure
// context: the web UI is reached over plain http from another machine.
export function newFolderId(kind: LibraryKind): string {
    return `${FOLDER_PREFIX[kind]}${uuidV4()}`
}

// Builds the rows the panel renders. Entities the order has never seen land at
// root, at the end, exactly where the flat list used to put them. An entity
// listed twice is kept at its first mention and dropped from the rest, and one
// whose entity is gone is dropped entirely, so neither can survive a reload.
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

// Callers must assign the result back to the store ref: the UI-settings save
// watcher only fires on whole-array replacement, not on in-place mutation.
//
// A folder this write does not know about is kept, not dropped. UI settings are
// saved as one blob, so a second client, or one whose copy predates the folder,
// would otherwise take every folder with it on its next drag. Deleting is
// `removeFolderEntry`, and nothing else.
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

// The one way a folder leaves the order. Callers drop the entry before
// persisting, so the write above does not read it back as one to keep.
export function removeFolderEntry(menuOrder: MenuOrderIds[], folderId: string): MenuOrderIds[] {
    return menuOrder.filter((entry) => entry.id !== folderId)
}

// The order the rest of the app sees: the lists read top to bottom, folders
// expanded in place. Every profile dropdown reads the entity array this sorts,
// so filing a profile moves it there too.
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

// New folders go to the top, next to the button that made them, so a long list
// does not hide the one waiting to be named.
export function addFolder(lists: LibraryLists, id: string): LibraryLists {
    return {
        rootIds: [id, ...lists.rootIds],
        folderChildren: { ...lists.folderChildren, [id]: [] },
    }
}

// The folder's items take its slot rather than the end of the list, so nothing
// jumps somewhere else when a user unfiles it. The entities themselves are
// never touched.
export function removeFolder(lists: LibraryLists, folderId: string): LibraryLists {
    const { [folderId]: children, ...folderChildren } = lists.folderChildren
    return {
        rootIds: lists.rootIds.flatMap((id) => (id === folderId ? (children ?? []) : [id])),
        folderChildren,
    }
}

// An empty name drops the entry, which is also how a deleted folder's name is
// cleared. Such a folder falls back to the panel's default label.
export function setFolderName(
    names: Array<[string, string]>,
    id: string,
    name: string,
): Array<[string, string]> {
    const next = names.filter(([key]) => key !== id)
    if (name.length > 0) next.push([id, name])
    return next
}
