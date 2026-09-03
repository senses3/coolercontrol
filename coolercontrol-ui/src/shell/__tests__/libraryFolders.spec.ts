// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import type { MenuOrderIds } from '@/models/UISettings.ts'
import {
    addFolder,
    buildLibraryTree,
    flatLibraryOrder,
    isFolderId,
    isFolderIdOfKind,
    newFolderId,
    persistLibraryTree,
    removeFolder,
    setFolderName,
    sortEntitiesByTree,
    type LibraryNode,
} from '../libraryFolders.ts'

const noNames = new Map<string, string>()

const entity = (uid: string): LibraryNode => ({ type: 'entity', uid })
const folder = (id: string, name: string, children: string[]): LibraryNode => ({
    type: 'folder',
    folder: { id, name, children },
})

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

describe('buildLibraryTree', () => {
    it('puts everything at root without an entry', () => {
        expect(buildLibraryTree([], 'profiles', ['a', 'b'], noNames)).toEqual([
            entity('a'),
            entity('b'),
        ])
    })

    it('interleaves folders and loose entities in the saved order', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['a', 'pf:1', 'b'] },
            { id: 'pf:1', children: ['c', 'd'] },
        ]
        expect(
            buildLibraryTree(
                menuOrder,
                'profiles',
                ['a', 'b', 'c', 'd'],
                new Map([['pf:1', 'Quiet']]),
            ),
        ).toEqual([entity('a'), folder('pf:1', 'Quiet', ['c', 'd']), entity('b')])
    })

    it('appends entities the order has never seen at root, at the end', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['pf:1', 'b'] },
            { id: 'pf:1', children: ['a'] },
        ]
        expect(buildLibraryTree(menuOrder, 'profiles', ['a', 'b', 'new'], noNames)).toEqual([
            folder('pf:1', '', ['a']),
            entity('b'),
            entity('new'),
        ])
    })

    it('keeps a doubly-filed entity at its first mention only', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['pf:1', 'pf:2', 'a'] },
            { id: 'pf:1', children: ['a'] },
            { id: 'pf:2', children: ['a'] },
        ]
        expect(buildLibraryTree(menuOrder, 'profiles', ['a'], noNames)).toEqual([
            folder('pf:1', '', ['a']),
            folder('pf:2', '', []),
        ])
    })

    it('prunes ids whose entity is gone', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['deleted', 'pf:1'] },
            { id: 'pf:1', children: ['a', 'alsoDeleted'] },
        ]
        expect(buildLibraryTree(menuOrder, 'profiles', ['a'], noNames)).toEqual([
            folder('pf:1', '', ['a']),
        ])
    })

    it('keeps an empty folder', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['pf:1'] },
            { id: 'pf:1', children: [] },
        ]
        expect(buildLibraryTree(menuOrder, 'profiles', [], noNames)).toEqual([
            folder('pf:1', '', []),
        ])
    })

    it('renders a folder id listed twice once', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['pf:1', 'pf:1'] },
            { id: 'pf:1', children: ['a'] },
        ]
        expect(buildLibraryTree(menuOrder, 'profiles', ['a'], noNames)).toEqual([
            folder('pf:1', '', ['a']),
        ])
    })

    it('reads only its own group', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['pf:1'] },
            { id: 'functions', children: ['fn:1'] },
            { id: 'pf:1', children: ['a'] },
            { id: 'fn:1', children: ['f'] },
        ]
        expect(buildLibraryTree(menuOrder, 'functions', ['f'], noNames)).toEqual([
            folder('fn:1', '', ['f']),
        ])
    })
})

describe('persistLibraryTree', () => {
    it('writes the root list and one entry per folder', () => {
        const nodes = [entity('a'), folder('pf:1', 'Quiet', ['c'])]
        expect(persistLibraryTree([], 'profiles', nodes)).toEqual([
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
        expect(persistLibraryTree(menuOrder, 'profiles', [folder('pf:1', '', ['a', 'b'])])).toEqual(
            [
                { id: 'profiles', children: ['pf:1'] },
                { id: 'pf:1', children: ['a', 'b'] },
            ],
        )
    })

    it('leaves device entries and the other group alone', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'dev1', children: ['dev1_fan1'] },
            { id: 'functions', children: ['fn:1'] },
            { id: 'fn:1', children: ['f'] },
        ]
        expect(persistLibraryTree(menuOrder, 'profiles', [entity('a')])).toEqual([
            { id: 'dev1', children: ['dev1_fan1'] },
            { id: 'functions', children: ['fn:1'] },
            { id: 'fn:1', children: ['f'] },
            { id: 'profiles', children: ['a'] },
        ])
    })

    it('round-trips a tree', () => {
        const nodes = [entity('a'), folder('pf:1', 'Quiet', ['c', 'd']), entity('b')]
        const menuOrder = persistLibraryTree([], 'profiles', nodes)
        expect(
            buildLibraryTree(
                menuOrder,
                'profiles',
                ['a', 'b', 'c', 'd'],
                new Map([['pf:1', 'Quiet']]),
            ),
        ).toEqual(nodes)
    })
})

describe('flatLibraryOrder', () => {
    it('reads the tree top to bottom with folders expanded in place', () => {
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
    it('sorts by the flattened tree, unknown ids last', () => {
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
    it('adds at the top', () => {
        expect(addFolder([entity('a')], 'pf:1', 'Quiet')).toEqual([
            folder('pf:1', 'Quiet', []),
            entity('a'),
        ])
    })

    it('returns the children to the folder slot, keeping the entities', () => {
        const nodes = [entity('a'), folder('pf:1', 'Quiet', ['c', 'd']), entity('b')]
        expect(removeFolder(nodes, 'pf:1')).toEqual([
            entity('a'),
            entity('c'),
            entity('d'),
            entity('b'),
        ])
    })

    it('removes an empty folder without a trace', () => {
        expect(removeFolder([folder('pf:1', '', []), entity('a')], 'pf:1')).toEqual([entity('a')])
    })

    it('ignores an unknown id', () => {
        const nodes = [entity('a')]
        expect(removeFolder(nodes, 'pf:9')).toEqual(nodes)
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
