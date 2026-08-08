// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// The app loads reflect-metadata via an injected script, tests must import it themselves.
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { type Device, DeviceType } from '@/models/Device.ts'
import { channelRoute, monitoringChannelRoute } from '../channelRoute.ts'

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

describe('monitoringChannelRoute', () => {
    it('keeps fan/pump channels on their monitoring chart', () => {
        const device = fakeDevice('d1', { fan1: { fixed_enabled: true } })
        expect(monitoringChannelRoute([device], 'd1', 'fan1')).toEqual({
            name: 'monitoring-sensor',
            params: { deviceUID: 'd1', channelName: 'fan1' },
        })
    })

    it('keeps custom sensors on their editor, so it stays one click away', () => {
        const device = fakeDevice('cs', { sensor1: undefined }, DeviceType.CUSTOM_SENSORS)
        expect(monitoringChannelRoute([device], 'cs', 'sensor1')).toEqual({
            name: 'device-custom-sensor',
            params: { customSensorID: 'sensor1' },
        })
    })

    it('matches channelRoute for everything that is not a fan/pump', () => {
        const device = fakeDevice('d1', { load1: undefined, temp1: undefined })
        const noInfo = { uid: 'd2', type: DeviceType.HWMON, info: null } as unknown as Device
        for (const [devices, uid, channel] of [
            [[device], 'd1', 'load1'],
            [[device], 'd1', 'temp1'],
            [[noInfo], 'd2', 'fan1'],
            [[], 'dx', 'fan1'],
        ] as const) {
            expect(monitoringChannelRoute(devices, uid, channel)).toEqual(
                channelRoute(devices, uid, channel),
            )
        }
    })

    it('differs from channelRoute only for fan/pump channels', () => {
        const device = fakeDevice('d1', { fan1: { fixed_enabled: true }, temp1: undefined })
        expect(monitoringChannelRoute([device], 'd1', 'fan1')).not.toEqual(
            channelRoute([device], 'd1', 'fan1'),
        )
        expect(monitoringChannelRoute([device], 'd1', 'temp1')).toEqual(
            channelRoute([device], 'd1', 'temp1'),
        )
    })
})
