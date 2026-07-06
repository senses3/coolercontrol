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

import { describe, expect, it } from 'vitest'
import type { MenuOrderIds } from '@/models/UISettings.ts'
import {
    orderedByGroup,
    reorderSubset,
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
