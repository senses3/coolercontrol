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

// pinnedIds mixes sensor pins and dashboard UIDs, and what reaches the tray has to be
// only the former, in the user's order, bounded. Getting this wrong is invisible in the
// SPA and only shows up as a wrong or empty tray menu.

// Device.ts uses class-transformer decorators which need the metadata polyfill.
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { type Device, DeviceType } from '@/models/Device.ts'
import { buildPinnedSensors } from '@/shell/qtPinnedSensors.ts'
import { pinId } from '@/shell/cooling/channels.ts'

const device = (uid: string, temps: string[], channels: string[]): Device =>
    ({
        uid,
        type: DeviceType.HWMON,
        info: {
            temps: new Map(temps.map((name) => [name, {}])),
            channels: new Map(
                channels.map((name) => [
                    name,
                    { lighting_modes: [], speed_options: { fixed_enabled: true } },
                ]),
            ),
        },
    }) as unknown as Device

const labelOf = (_uid: string, channelName: string) => `label:${channelName}`
const colorOf = (_uid: string, channelName: string) => `#c0${channelName.length}`
const routeOf = (uid: string, channelName: string) => `#/monitoring/sensors/${uid}/${channelName}`

describe('qt pinned sensors', () => {
    const devices = [device('d1', ['temp1', 'temp2'], ['fan1']), device('d2', ['temp1'], ['fan1'])]

    it('resolves pins to identity and label', () => {
        const out = buildPinnedSensors(devices, [pinId('d1', 'temp1')], labelOf, colorOf, routeOf)
        expect(out).toEqual([
            {
                deviceUid: 'd1',
                channelName: 'temp1',
                label: 'label:temp1',
                isTemp: true,
                color: '#c05',
                route: '#/monitoring/sensors/d1/temp1',
            },
        ])
    })

    it('ignores pinned ids that are not sensors, such as dashboards', () => {
        const out = buildPinnedSensors(
            devices,
            ['a-dashboard-uuid', pinId('d2', 'fan1'), 'another-uuid'],
            labelOf,
            colorOf,
            routeOf,
        )
        expect(out.map((s) => `${s.deviceUid}/${s.channelName}`)).toEqual(['d2/fan1'])
    })

    it('keeps the pinned order rather than device order', () => {
        const out = buildPinnedSensors(
            devices,
            [pinId('d2', 'fan1'), pinId('d1', 'temp1')],
            labelOf,
            colorOf,
            routeOf,
        )
        expect(out.map((s) => s.deviceUid)).toEqual(['d2', 'd1'])
    })

    it('passes through every pinned sensor, however many', () => {
        const many = [
            pinId('d1', 'temp1'),
            pinId('d1', 'temp2'),
            pinId('d1', 'fan1'),
            pinId('d2', 'temp1'),
            pinId('d2', 'fan1'),
        ]
        expect(buildPinnedSensors(devices, many, labelOf, colorOf, routeOf)).toHaveLength(
            many.length,
        )
    })

    it('marks temps so the tray can tell them from channels', () => {
        const out = buildPinnedSensors(
            devices,
            [pinId('d1', 'temp1'), pinId('d1', 'fan1')],
            labelOf,
            colorOf,
            routeOf,
        )
        expect(out.map((s) => s.isTemp)).toEqual([true, false])
    })
})
