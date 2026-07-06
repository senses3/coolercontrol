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

// Device.ts uses class-transformer decorators which need the metadata polyfill.
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { type Device, DeviceType } from '@/models/Device.ts'
import { customSensors, monitoringSensors } from '../monitoring/sensors.ts'

interface FakeChannel {
    speed_options?: object
    lighting_modes?: object[]
    lcd_info?: object
}

function fakeDevice(
    uid: string,
    type: DeviceType,
    temps: string[],
    channels: Record<string, FakeChannel>,
): Device {
    return {
        uid,
        type,
        info: {
            temps: new Map(temps.map((name) => [name, {}])),
            channels: new Map(
                Object.entries(channels).map(([name, channel]) => [
                    name,
                    { lighting_modes: [], ...channel },
                ]),
            ),
        },
    } as unknown as Device
}

describe('monitoringSensors', () => {
    it('includes temps, fans and value channels, excludes lighting/lcd', () => {
        const device = fakeDevice('d1', DeviceType.HWMON, ['temp1'], {
            fan1: { speed_options: { fixed_enabled: true } },
            'CPU Load': {},
            freq1: {},
            led1: { lighting_modes: [{}] },
            lcd1: { lcd_info: {} },
        })
        const groups = monitoringSensors([device])
        expect(groups).toHaveLength(1)
        expect(groups[0].sensors.map((s) => s.channelName)).toEqual([
            'temp1',
            'fan1',
            'CPU Load',
            'freq1',
        ])
        expect(groups[0].sensors[0].isTemp).toBe(true)
        expect(groups[0].sensors[1].isTemp).toBe(false)
    })

    it('excludes custom-sensor devices and devices without sensors', () => {
        const custom = fakeDevice('c1', DeviceType.CUSTOM_SENSORS, ['sensor1'], {})
        const lightingOnly = fakeDevice('d1', DeviceType.HWMON, [], {
            led1: { lighting_modes: [{}] },
        })
        const noInfo = { uid: 'd2', type: DeviceType.HWMON, info: null } as unknown as Device
        expect(monitoringSensors([custom, lightingOnly, noInfo])).toEqual([])
    })
})

describe('customSensors', () => {
    it('lists only the temps of custom-sensor devices', () => {
        const custom = fakeDevice('c1', DeviceType.CUSTOM_SENSORS, ['sensor1', 'sensor2'], {})
        const hwmon = fakeDevice('d1', DeviceType.HWMON, ['temp1'], {})
        const sensors = customSensors([custom, hwmon])
        expect(sensors.map((s) => s.channelName)).toEqual(['sensor1', 'sensor2'])
        expect(sensors.every((s) => s.isTemp)).toBe(true)
    })
})
