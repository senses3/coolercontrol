// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { mdiFolderOutline } from '@mdi/js'
import { describe, expect, it } from 'vitest'
import type { MenuOrderIds } from '@/models/UISettings.ts'
import { libraryOptionGroups } from '../cooling/libraryOptions.ts'

const entities = [
    { uid: 'a', name: 'Silent' },
    { uid: 'b', name: 'Loud' },
    { uid: 'c', name: 'Balanced' },
]

describe('libraryOptionGroups', () => {
    // Someone with no folders must see exactly the flat list they saw before.
    it('is one unlabelled group without folders', () => {
        expect(libraryOptionGroups([], 'profiles', entities, [], 'New Folder')).toEqual([
            {
                id: 'loose:0',
                label: '',
                options: [
                    { label: 'Silent', value: 'a' },
                    { label: 'Loud', value: 'b' },
                    { label: 'Balanced', value: 'c' },
                ],
            },
        ])
    })

    // The whole point: the picker reads top to bottom exactly like the panel,
    // so a folder does not shunt the loose profiles above or below it.
    it('keeps the panel order, folders in place', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['a', 'pf:1', 'c'] },
            { id: 'pf:1', children: ['b'] },
        ]
        expect(
            libraryOptionGroups(menuOrder, 'profiles', entities, [['pf:1', 'Quiet']], 'New Folder'),
        ).toEqual([
            { id: 'loose:0', label: '', options: [{ label: 'Silent', value: 'a' }] },
            {
                id: 'pf:1',
                label: 'Quiet',
                icon: mdiFolderOutline,
                options: [{ label: 'Loud', value: 'b' }],
            },
            { id: 'loose:2', label: '', options: [{ label: 'Balanced', value: 'c' }] },
        ])
    })

    // Two unlabelled runs in one list is why a group carries an id: a label
    // cannot key them apart.
    it('gives every group a unique key', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['a', 'pf:1', 'c'] },
            { id: 'pf:1', children: ['b'] },
        ]
        const ids = libraryOptionGroups(menuOrder, 'profiles', entities, [], 'New Folder').map(
            (group) => group.id,
        )
        expect(new Set(ids).size).toBe(ids.length)
    })

    // An empty folder between two loose profiles must not split them into two
    // groups, which would read as a divider with nothing dividing. 'b' is in
    // no list, so it lands at root end, as it does in the panel.
    it('does not split a loose run around a folder that renders nothing', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['a', 'pf:1', 'c'] },
            { id: 'pf:1', children: [] },
        ]
        expect(libraryOptionGroups(menuOrder, 'profiles', entities, [], 'New Folder')).toEqual([
            {
                id: 'loose:0',
                label: '',
                options: [
                    { label: 'Silent', value: 'a' },
                    { label: 'Balanced', value: 'c' },
                    { label: 'Loud', value: 'b' },
                ],
            },
        ])
    })

    // An empty group would render a heading over nothing, and a picker whose
    // every profile is filed would otherwise open on a blank first block.
    it('drops empty groups, including the loose one', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['pf:1', 'pf:2'] },
            { id: 'pf:1', children: ['a', 'b', 'c'] },
            { id: 'pf:2', children: [] },
        ]
        expect(
            libraryOptionGroups(menuOrder, 'profiles', entities, [['pf:1', 'Quiet']], 'New Folder'),
        ).toEqual([
            {
                id: 'pf:1',
                label: 'Quiet',
                icon: mdiFolderOutline,
                options: [
                    { label: 'Silent', value: 'a' },
                    { label: 'Loud', value: 'b' },
                    { label: 'Balanced', value: 'c' },
                ],
            },
        ])
    })

    it('labels a folder whose name was never set', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['pf:1'] },
            { id: 'pf:1', children: ['a'] },
        ]
        expect(libraryOptionGroups(menuOrder, 'profiles', entities, [], 'New Folder')[0]).toEqual({
            id: 'pf:1',
            label: 'New Folder',
            icon: mdiFolderOutline,
            options: [{ label: 'Silent', value: 'a' }],
        })
    })

    // The picker is handed a filtered list (the default profile is not
    // choosable here), so an id the caller left out must not reappear.
    it('shows only the entities it was given', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'profiles', children: ['pf:1', 'a'] },
            { id: 'pf:1', children: ['b', 'gone'] },
        ]
        const groups = libraryOptionGroups(
            menuOrder,
            'profiles',
            [entities[0], entities[1]],
            [['pf:1', 'Quiet']],
            'New Folder',
        )
        expect(groups).toEqual([
            {
                id: 'pf:1',
                label: 'Quiet',
                icon: mdiFolderOutline,
                options: [{ label: 'Loud', value: 'b' }],
            },
            { id: 'loose:1', label: '', options: [{ label: 'Silent', value: 'a' }] },
        ])
    })

    it('reads only its own kind', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'functions', children: ['fn:1'] },
            { id: 'fn:1', children: ['a'] },
        ]
        expect(libraryOptionGroups(menuOrder, 'profiles', entities, [], 'New Folder')).toEqual([
            {
                id: 'loose:0',
                label: '',
                options: [
                    { label: 'Silent', value: 'a' },
                    { label: 'Loud', value: 'b' },
                    { label: 'Balanced', value: 'c' },
                ],
            },
        ])
    })
})
