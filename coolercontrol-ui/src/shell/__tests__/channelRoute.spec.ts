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

// The app loads reflect-metadata via an injected script, tests must import it themselves.
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { type Device, DeviceType } from '@/models/Device.ts'
import { channelRoute } from '../channelRoute.ts'

function fakeDevice(
    uid: string,
    channels: Record<string, object | undefined>,
    type: DeviceType = DeviceType.HWMON,
): Device {
    return {
        uid,
        type,
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

describe('channelRoute', () => {
    it('routes fan/pump channels to their cooling page', () => {
        const device = fakeDevice('d1', { fan1: { fixed_enabled: true } })
        expect(channelRoute([device], 'd1', 'fan1')).toEqual({
            name: 'cooling-channel',
            params: { deviceUID: 'd1', channelName: 'fan1' },
        })
    })

    it('routes non-controllable fans to their cooling page too', () => {
        const device = fakeDevice('d1', { fan1: { fixed_enabled: false } })
        expect(channelRoute([device], 'd1', 'fan1')).toEqual({
            name: 'cooling-channel',
            params: { deviceUID: 'd1', channelName: 'fan1' },
        })
    })

    it('routes read-only sensors to their monitoring chart', () => {
        const device = fakeDevice('d1', { load1: undefined })
        expect(channelRoute([device], 'd1', 'load1')).toEqual({
            name: 'monitoring-sensor',
            params: { deviceUID: 'd1', channelName: 'load1' },
        })
    })

    it('routes custom sensors to their editor', () => {
        const device = fakeDevice('cs', { sensor1: undefined }, DeviceType.CUSTOM_SENSORS)
        expect(channelRoute([device], 'cs', 'sensor1')).toEqual({
            name: 'device-custom-sensor',
            params: { customSensorID: 'sensor1' },
        })
    })

    it('falls back to monitoring for unknown devices or missing info', () => {
        const noInfo = { uid: 'd2', type: DeviceType.HWMON, info: null } as unknown as Device
        expect(channelRoute([], 'dx', 'fan1')).toMatchObject({ name: 'monitoring-sensor' })
        expect(channelRoute([noInfo], 'd2', 'fan1')).toMatchObject({ name: 'monitoring-sensor' })
    })
})
