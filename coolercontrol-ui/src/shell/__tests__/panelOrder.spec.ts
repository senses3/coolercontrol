// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import type { MenuOrderIds } from '@/models/UISettings.ts'
import {
    orderPinnedRows,
    orderedByGroup,
    reorderSubset,
    reorderTopLevel,
    setDeviceChildrenSubset,
    setGroupOrder,
    setTopLevelOrder,
    sortEntitiesByGroup,
} from '../panelOrder.ts'

describe('orderedByGroup', () => {
    it('sorts by the group children, unknown ids last', () => {
        const menuOrder: MenuOrderIds[] = [{ id: 'alerts', children: ['b', 'a'] }]
        const items = [{ uid: 'a' }, { uid: 'b' }, { uid: 'new' }]
        expect(orderedByGroup(menuOrder, 'alerts', items, (i) => i.uid).map((i) => i.uid)).toEqual([
            'b',
            'a',
            'new',
        ])
    })

    it('returns items unchanged without an entry', () => {
        const items = [{ uid: 'a' }, { uid: 'b' }]
        expect(orderedByGroup([], 'alerts', items, (i) => i.uid)).toEqual(items)
    })
})

describe('setGroupOrder', () => {
    it('updates an existing entry', () => {
        const result = setGroupOrder([{ id: 'profiles', children: ['a'] }], 'profiles', ['b', 'a'])
        expect(result).toEqual([{ id: 'profiles', children: ['b', 'a'] }])
    })

    it('appends a new entry when missing', () => {
        expect(setGroupOrder([], 'dashboards', ['x'])).toEqual([
            { id: 'dashboards', children: ['x'] },
        ])
    })
})

describe('setTopLevelOrder', () => {
    it('reorders device entries and keeps group entries', () => {
        const result = setTopLevelOrder(
            [
                { id: 'd1', children: ['d1_fan'] },
                { id: 'profiles', children: ['p1'] },
                { id: 'd2', children: [] },
            ],
            ['d2', 'd1'],
        )
        expect(result.map((entry) => entry.id)).toEqual(['d2', 'd1', 'profiles'])
        expect(result[1].children).toEqual(['d1_fan'])
    })

    it('creates entries for unknown uids', () => {
        expect(setTopLevelOrder([], ['d1'])).toEqual([{ id: 'd1', children: [] }])
    })
})

describe('reorderSubset', () => {
    it('reorders subset ids in place, leaving others fixed', () => {
        expect(reorderSubset(['a', 'x', 'b', 'y'], ['b', 'a'])).toEqual(['b', 'x', 'a', 'y'])
    })
})

describe('setDeviceChildrenSubset', () => {
    it('keeps undisplayed ids while applying the dragged subset', () => {
        const result = setDeviceChildrenSubset(
            [{ id: 'd1', children: ['d1_fan1', 'd1_temp1', 'd1_fan2'] }],
            'd1',
            ['d1_fan2', 'd1_fan1'],
            ['d1_fan1', 'd1_fan2', 'd1_temp1'],
        )
        expect(result[0].children).toEqual(['d1_fan2', 'd1_temp1', 'd1_fan1'])
    })

    it('appends ids never ordered before', () => {
        const result = setDeviceChildrenSubset([], 'd1', ['d1_b', 'd1_a'], ['d1_a', 'd1_b'])
        expect(result[0].children).toEqual(['d1_b', 'd1_a'])
    })
})

describe('sortEntitiesByGroup', () => {
    it('sorts the array in place by the persisted order', () => {
        const menuOrder: MenuOrderIds[] = [{ id: 'profiles', children: ['p2', 'p1'] }]
        const entities = [{ uid: 'p1' }, { uid: 'p2' }, { uid: 'p3' }]
        sortEntitiesByGroup(menuOrder, 'profiles', entities, (e) => e.uid)
        expect(entities.map((e) => e.uid)).toEqual(['p2', 'p1', 'p3'])
    })
})

describe('orderPinnedRows', () => {
    // The bug this guards: the monitoring panel used to render pinned dashboards
    // as their own list above pinned sensors, so a dashboard pinned last showed
    // above sensors pinned first, and the home panel disagreed with it.
    it('follows the pin order across kinds', () => {
        const rows = new Map([
            ['dev1_temp1', 'sensorA'],
            ['dash-uid', 'dashboardB'],
            ['dev1_fan1', 'sensorC'],
        ])
        expect(orderPinnedRows(['dev1_temp1', 'dash-uid', 'dev1_fan1'], rows)).toEqual([
            'sensorA',
            'dashboardB',
            'sensorC',
        ])
    })

    // A panel only builds rows for the kinds it shows, and pinnedIds is shared
    // with the panels that show the others.
    it('drops ids the panel has no row for', () => {
        const rows = new Map([['kept', 'row']])
        expect(orderPinnedRows(['gone', 'kept', 'also-gone'], rows)).toEqual(['row'])
    })

    it('returns nothing when nothing is pinned', () => {
        expect(orderPinnedRows([], new Map([['a', 1]]))).toEqual([])
    })
})

describe('reorderTopLevel', () => {
    const ids = (order: MenuOrderIds[]) => order.map((entry) => entry.id)

    // Cooling lists devices with controllable channels, Monitoring devices with
    // sensors, so a drag in either only ever sees part of the device order.
    it('permutes the shown devices within the slots they already hold', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'devA', children: ['a1'] },
            { id: 'devHidden', children: [] },
            { id: 'devB', children: ['b1'] },
        ]
        expect(ids(reorderTopLevel(menuOrder, ['devB', 'devA']))).toEqual([
            'devB',
            'devHidden',
            'devA',
        ])
    })

    it('keeps each moved device its children', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'devA', children: ['a1'] },
            { id: 'devB', children: ['b1'] },
        ]
        expect(reorderTopLevel(menuOrder, ['devB', 'devA'])).toEqual([
            { id: 'devB', children: ['b1'] },
            { id: 'devA', children: ['a1'] },
        ])
    })

    // Group ids share the top level with devices and must not be dragged over.
    it('leaves the entity group entries where they were', () => {
        const menuOrder: MenuOrderIds[] = [
            { id: 'devA', children: [] },
            { id: 'profiles', children: ['p1'] },
            { id: 'devB', children: [] },
        ]
        expect(ids(reorderTopLevel(menuOrder, ['devB', 'devA']))).toEqual([
            'devB',
            'profiles',
            'devA',
        ])
    })

    it('appends a device the order has never seen', () => {
        const menuOrder: MenuOrderIds[] = [{ id: 'devA', children: [] }]
        expect(ids(reorderTopLevel(menuOrder, ['devA', 'devNew']))).toEqual(['devA', 'devNew'])
    })
})
