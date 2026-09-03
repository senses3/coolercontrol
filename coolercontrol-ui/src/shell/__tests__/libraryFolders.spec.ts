// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import type { MenuOrderIds } from '@/models/UISettings.ts'
import {
    addFolder,
    buildLibraryLists,
    flatLibraryOrder,
    isFolderId,
    isFolderIdOfKind,
    newFolderId,
    persistLibraryLists,
    removeFolder,
    setFolderName,
    sortEntitiesByTree,
} from '../libraryFolders.ts'

describe('folder ids', () => {
    it('prefixes per kind', () => {
        expect(isFolderIdOfKind(newFolderId('profiles'), 'profiles')).toBe(true)
        expect(isFolderIdOfKind(newFolderId('profiles'), 'functions')).toBe(false)
        expect(isFolderId(newFolderId('functions'))).toBe(true)
    })

    it('does not mistake an entity uid for a folder', () => {
        expect(isFolderId('9f1c-uid')).toBe(false)
    })

    it('is unique per call', () => {
        expect(newFolderId('profiles')).not.toEqual(newFolderId('profiles'))
    })
})

describe('buildLibraryLists', () => {
    it('puts everything at root without an entry', () => {
        expect(buildLibraryLists([], 'profiles', ['a', 'b'])).toEqual({
            rootIds: ['a', 'b'],
            folderChildren: {},
        })
    })

    it('interleaves folders and loose entities in the saved order', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['a', 'pf:1', 'b'] },
            { id: 'pf:1', children: ['c', 'd'] },
        ]
        expect(buildLibraryLists(menuOrder, 'profiles', ['a', 'b', 'c', 'd'])).toEqual({
            rootIds: ['a', 'pf:1', 'b'],
            folderChildren: { 'pf:1': ['c', 'd'] },
        })
    })

    it('appends entities the order has never seen at root, at the end', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['pf:1', 'b'] },
            { id: 'pf:1', children: ['a'] },
        ]
        expect(buildLibraryLists(menuOrder, 'profiles', ['a', 'b', 'new'])).toEqual({
            rootIds: ['pf:1', 'b', 'new'],
            folderChildren: { 'pf:1': ['a'] },
        })
    })

    it('keeps a doubly-filed entity at its first mention only', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['pf:1', 'pf:2', 'a'] },
            { id: 'pf:1', children: ['a'] },
            { id: 'pf:2', children: ['a'] },
        ]
        expect(buildLibraryLists(menuOrder, 'profiles', ['a'])).toEqual({
            rootIds: ['pf:1', 'pf:2'],
            folderChildren: { 'pf:1': ['a'], 'pf:2': [] },
        })
    })

    it('prunes ids whose entity is gone', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['deleted', 'pf:1'] },
            { id: 'pf:1', children: ['a', 'alsoDeleted'] },
        ]
        expect(buildLibraryLists(menuOrder, 'profiles', ['a'])).toEqual({
            rootIds: ['pf:1'],
            folderChildren: { 'pf:1': ['a'] },
        })
    })

    it('keeps an empty folder', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['pf:1'] },
            { id: 'pf:1', children: [] },
        ]
        expect(buildLibraryLists(menuOrder, 'profiles', [])).toEqual({
            rootIds: ['pf:1'],
            folderChildren: { 'pf:1': [] },
        })
    })

    it('renders a folder id listed twice once', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['pf:1', 'pf:1'] },
            { id: 'pf:1', children: ['a'] },
        ]
        expect(buildLibraryLists(menuOrder, 'profiles', ['a'])).toEqual({
            rootIds: ['pf:1'],
            folderChildren: { 'pf:1': ['a'] },
        })
    })

    it('reads only its own group', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['pf:1'] },
            { id: 'functions', children: ['fn:1'] },
            { id: 'pf:1', children: ['a'] },
            { id: 'fn:1', children: ['f'] },
        ]
        expect(buildLibraryLists(menuOrder, 'functions', ['f'])).toEqual({
            rootIds: ['fn:1'],
            folderChildren: { 'fn:1': ['f'] },
        })
    })
})

describe('persistLibraryLists', () => {
    it('writes the root list and one entry per folder', () => {
        const lists = { rootIds: ['a', 'pf:1'], folderChildren: { 'pf:1': ['c'] } }
        expect(persistLibraryLists([], 'profiles', lists)).toEqual([
            { id: 'profiles', children: ['a', 'pf:1'] },
            { id: 'pf:1', children: ['c'] },
        ])
    })

    it('drops entries for folders the group no longer has', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['pf:1', 'pf:2'] },
            { id: 'pf:1', children: ['a'] },
            { id: 'pf:2', children: ['b'] },
        ]
        const lists = { rootIds: ['pf:1'], folderChildren: { 'pf:1': ['a', 'b'] } }
        expect(persistLibraryLists(menuOrder, 'profiles', lists)).toEqual([
            { id: 'profiles', children: ['pf:1'] },
            { id: 'pf:1', children: ['a', 'b'] },
        ])
    })

    it('leaves device entries and the other group alone', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'dev1', children: ['dev1_fan1'] },
            { id: 'functions', children: ['fn:1'] },
            { id: 'fn:1', children: ['f'] },
        ]
        const lists = { rootIds: ['a'], folderChildren: {} }
        expect(persistLibraryLists(menuOrder, 'profiles', lists)).toEqual([
            { id: 'dev1', children: ['dev1_fan1'] },
            { id: 'functions', children: ['fn:1'] },
            { id: 'fn:1', children: ['f'] },
            { id: 'profiles', children: ['a'] },
        ])
    })

    it('round-trips the lists', () => {
        const lists = {
            rootIds: ['a', 'pf:1', 'b'],
            folderChildren: { 'pf:1': ['c', 'd'] },
        }
        const menuOrder = persistLibraryLists([], 'profiles', lists)
        expect(buildLibraryLists(menuOrder, 'profiles', ['a', 'b', 'c', 'd'])).toEqual(lists)
    })
})

describe('flatLibraryOrder', () => {
    it('reads the lists top to bottom with folders expanded in place', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['a', 'pf:1', 'b'] },
            { id: 'pf:1', children: ['c', 'd'] },
        ]
        expect(flatLibraryOrder(menuOrder, 'profiles')).toEqual(['a', 'c', 'd', 'b'])
    })

    it('is empty without an entry', () => {
        expect(flatLibraryOrder([], 'profiles')).toEqual([])
    })

    it('emits a doubly-listed uid once', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['pf:1', 'a'] },
            { id: 'pf:1', children: ['a'] },
        ]
        expect(flatLibraryOrder(menuOrder, 'profiles')).toEqual(['a'])
    })
})

describe('sortEntitiesByTree', () => {
    it('sorts by the flattened lists, unknown ids last', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['b', 'pf:1'] },
            { id: 'pf:1', children: ['a'] },
        ]
        const entities = [{ uid: 'new' }, { uid: 'a' }, { uid: 'b' }]
        sortEntitiesByTree(menuOrder, 'profiles', entities, (item) => item.uid)
        expect(entities.map((item) => item.uid)).toEqual(['b', 'a', 'new'])
    })

    it('leaves the entities alone without an entry', () => {
        const entities = [{ uid: 'b' }, { uid: 'a' }]
        sortEntitiesByTree([], 'profiles', entities, (item) => item.uid)
        expect(entities.map((item) => item.uid)).toEqual(['b', 'a'])
    })
})

describe('addFolder and removeFolder', () => {
    it('adds an empty folder at the top', () => {
        const lists = { rootIds: ['a'], folderChildren: {} }
        expect(addFolder(lists, 'pf:1')).toEqual({
            rootIds: ['pf:1', 'a'],
            folderChildren: { 'pf:1': [] },
        })
    })

    it('returns the children to the folder slot, keeping the entities', () => {
        const lists = {
            rootIds: ['a', 'pf:1', 'b'],
            folderChildren: { 'pf:1': ['c', 'd'] },
        }
        expect(removeFolder(lists, 'pf:1')).toEqual({
            rootIds: ['a', 'c', 'd', 'b'],
            folderChildren: {},
        })
    })

    it('removes an empty folder without a trace', () => {
        const lists = { rootIds: ['pf:1', 'a'], folderChildren: { 'pf:1': [] } }
        expect(removeFolder(lists, 'pf:1')).toEqual({ rootIds: ['a'], folderChildren: {} })
    })

    it('leaves the other folders alone', () => {
        const lists = {
            rootIds: ['pf:1', 'pf:2'],
            folderChildren: { 'pf:1': ['a'], 'pf:2': ['b'] },
        }
        expect(removeFolder(lists, 'pf:1')).toEqual({
            rootIds: ['a', 'pf:2'],
            folderChildren: { 'pf:2': ['b'] },
        })
    })

    it('ignores an unknown id', () => {
        const lists = { rootIds: ['a'], folderChildren: {} }
        expect(removeFolder(lists, 'pf:9')).toEqual(lists)
    })
})

describe('setFolderName', () => {
    it('adds a name', () => {
        expect(setFolderName([], 'pf:1', 'Quiet')).toEqual([['pf:1', 'Quiet']])
    })

    it('replaces a name without duplicating the id', () => {
        expect(setFolderName([['pf:1', 'Quiet']], 'pf:1', 'Loud')).toEqual([['pf:1', 'Loud']])
    })

    it('drops the entry for an empty name', () => {
        expect(
            setFolderName(
                [
                    ['pf:1', 'Quiet'],
                    ['pf:2', 'Loud'],
                ],
                'pf:1',
                '',
            ),
        ).toEqual([['pf:2', 'Loud']])
    })
})
