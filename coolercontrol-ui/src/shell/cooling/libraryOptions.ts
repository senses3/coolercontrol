// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// The Library folders, as option groups for the pickers that choose a profile
// or a function. The picker reads exactly like the panel: folders and loose
// entities in the same interleaved order, each run of loose entities its own
// unlabelled group. That takes a group id, since a label cannot key two of
// them. Empty groups drop out, so a user with no folders sees exactly the flat
// list they see today.

import { mdiFolderOutline } from '@mdi/js'
import type { MenuOrderIds } from '@/models/UISettings.ts'
import type { UiGroupedOption, UiOptionGroup } from '@/shell/ui/UiGroupedListbox.vue'
import { buildLibraryLists, isFolderId, type LibraryKind } from '@/shell/libraryFolders.ts'

export interface LibraryEntity {
    uid: string
    name: string
}

export function libraryOptionGroups(
    menuOrder: MenuOrderIds[],
    kind: LibraryKind,
    entities: LibraryEntity[],
    folderNames: Array<[string, string]>,
    untitledFolder: string,
): UiOptionGroup[] {
    const label = new Map(entities.map((entity) => [entity.uid, entity.name]))
    const names = new Map(folderNames)
    const toOptions = (uids: string[]) =>
        uids
            .filter((uid) => label.has(uid))
            .map((uid) => ({ label: label.get(uid) ?? uid, value: uid }))

    const lists = buildLibraryLists(
        menuOrder,
        kind,
        entities.map((entity) => entity.uid),
    )
    const groups: UiOptionGroup[] = []
    let loose: string[] = []
    const flushLoose = (): void => {
        if (loose.length === 0) return
        groups.push({ id: `loose:${groups.length}`, label: '', options: toOptions(loose) })
        loose = []
    }
    for (const id of lists.rootIds) {
        if (!isFolderId(id)) {
            if (label.has(id)) loose.push(id)
            continue
        }
        const options = toOptions(lists.folderChildren[id] ?? [])
        // Flushed only for a folder that renders, so an empty one does not
        // split the loose run around it into two.
        if (options.length === 0) continue
        flushLoose()
        groups.push({
            id,
            label: names.get(id) || untitledFolder,
            icon: mdiFolderOutline,
            options,
        })
    }
    flushLoose()
    return groups
}

// The default function is never listed in the panel, so the folders know
// nothing about it and it would sort to the bottom as an unfiled entity. The
// pickers do offer it, and it belongs first, where it has always been.
export function withLeadingOption(
    groups: UiOptionGroup[],
    option: UiGroupedOption | undefined,
): UiOptionGroup[] {
    if (option == null) return groups
    const [first, ...rest] = groups
    return first?.label === ''
        ? [{ ...first, options: [option, ...first.options] }, ...rest]
        : [{ id: 'leading', label: '', options: [option] }, ...groups]
}
