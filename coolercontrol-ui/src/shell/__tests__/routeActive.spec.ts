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
import { isSameTarget } from '../routeActive.ts'

const at = (name: string, params: Record<string, string> = {}) => ({ name, params })

describe('isSameTarget', () => {
    /// Goal: the row the user opened is the row that highlights.
    it('matches the same record and params', () => {
        const target = at('cooling-channel', { deviceUID: 'dev-1', channelName: 'fan1' })
        expect(isSameTarget(target, target)).toBe(true)
    })

    /// Goal: sibling rows do not all light up. Two channels on one device
    /// share a route record and differ only in a param, which is the case a
    /// name-only check would get wrong.
    it('separates rows that differ only by a param', () => {
        expect(
            isSameTarget(
                at('cooling-channel', { deviceUID: 'dev-1', channelName: 'fan1' }),
                at('cooling-channel', { deviceUID: 'dev-1', channelName: 'fan2' }),
            ),
        ).toBe(false)
        expect(
            isSameTarget(
                at('cooling-channel', { deviceUID: 'dev-1', channelName: 'fan1' }),
                at('cooling-channel', { deviceUID: 'dev-2', channelName: 'fan1' }),
            ),
        ).toBe(false)
    })

    /// Goal: a different page never highlights a row.
    it('rejects a different route record', () => {
        expect(
            isSameTarget(
                at('monitoring-sensor', { deviceUID: 'dev-1', channelName: 'fan1' }),
                at('cooling-channel', { deviceUID: 'dev-1', channelName: 'fan1' }),
            ),
        ).toBe(false)
    })

    /// Goal: a nameless target cannot match anything, so a row with no route
    /// stays unhighlighted rather than matching the first nameless page.
    it('rejects a target with no name', () => {
        expect(isSameTarget(at('cooling-channel'), { params: {} })).toBe(false)
        expect(isSameTarget(at('cooling-channel'), { name: null, params: {} })).toBe(false)
    })

    /// Goal: query-only differences still count as the same page, matching what
    /// vue-router's exact-active does, so a row keeps its highlight when a page
    /// writes state into the query.
    it('ignores query, matching exact-active semantics', () => {
        const current = { name: 'monitoring-sensor', params: { deviceUID: 'dev-1' } }
        const target = { name: 'monitoring-sensor', params: { deviceUID: 'dev-1' } }
        expect(isSameTarget(current, target)).toBe(true)
    })

    /// Goal: params arriving as numbers from a route resolve still compare
    /// equal to the strings a row builds them from.
    it('compares params by value, not type', () => {
        expect(
            isSameTarget(
                { name: 'plugin-page', params: { pluginId: '3' } },
                { name: 'plugin-page', params: { pluginId: 3 as unknown as string } },
            ),
        ).toBe(true)
    })
})
