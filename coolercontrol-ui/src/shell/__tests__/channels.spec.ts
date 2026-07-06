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
import type { Device } from '@/models/Device.ts'
import { coolingChannels, pinId } from '../cooling/channels.ts'

function fakeDevice(uid: string, channels: Record<string, object | undefined>): Device {
    return {
        uid,
        info: {
            channels: new Map(
                Object.entries(channels).map(([name, speedOptions]) => [
                    name,
                    { speed_options: speedOptions },
                ]),
            ),
        },
    } as unknown as Device
}

describe('coolingChannels', () => {
    it('includes only channels with speed options', () => {
        const device = fakeDevice('d1', {
            fan1: { fixed_enabled: true, min_duty: 0, max_duty: 100 },
            temp1: undefined,
        })
        const groups = coolingChannels([device])
        expect(groups).toHaveLength(1)
        expect(groups[0].channels.map((c) => c.channelName)).toEqual(['fan1'])
        expect(groups[0].channels[0].controllable).toBe(true)
    })

    it('marks channels without fixed_enabled as not controllable', () => {
        const device = fakeDevice('d1', {
            fan1: { fixed_enabled: false, min_duty: 20, max_duty: 80 },
        })
        const channel = coolingChannels([device])[0].channels[0]
        expect(channel.controllable).toBe(false)
        expect(channel.minDuty).toBe(20)
        expect(channel.maxDuty).toBe(80)
    })

    it('skips devices without fan channels or info', () => {
        const noFans = fakeDevice('d1', { temp1: undefined })
        const noInfo = { uid: 'd2', info: null } as unknown as Device
        expect(coolingChannels([noFans, noInfo])).toEqual([])
    })

    it('builds pin ids in the legacy tree format', () => {
        expect(pinId('abc', 'fan1')).toBe('abc_fan1')
    })
})
