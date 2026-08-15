// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Device.ts carries class-transformer decorators, which need the polyfill.
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { Device, DeviceType } from '@/models/Device.ts'
import { DeviceInfo } from '@/models/DeviceInfo.ts'
import { Profile, ProfileTempSource, ProfileType } from '@/models/Profile.ts'
import { TempInfo } from '@/models/TempInfo.ts'
import { curveOwnership, seedCurve, seedTempSource } from '@/shell/simple/simpleCurve.ts'

const graph = (uid: string): Profile => {
    const profile = new Profile('curve', ProfileType.Graph)
    profile.uid = uid
    return profile
}

const withTemps = (uid: string, type: DeviceType, temps: string[]): Device => {
    const info = new DeviceInfo()
    for (const name of temps) info.temps.set(name, new TempInfo(name, 1))
    return new Device(uid, uid, type, 1, undefined, info)
}

describe('simple curve ownership', () => {
    it('only calls a graph this fan alone uses its own', () => {
        expect(curveOwnership(graph('p1'), 0)).toBe('owned')
        expect(curveOwnership(graph('p1'), 2)).toBe('shared')
    })

    it('reports anything that is not a graph as unsupported', () => {
        const fixed = new Profile('fixed', ProfileType.Fixed, 50)
        fixed.uid = 'p2'
        expect(curveOwnership(fixed, 0)).toBe('unsupported')
        const mix = new Profile('mix', ProfileType.Mix)
        mix.uid = 'p3'
        expect(curveOwnership(mix, 0)).toBe('unsupported')
    })

    // The default profile is how the daemon spells "unmanaged", not a curve
    // whose ownership could be forked.
    it('treats no profile and the default profile as none', () => {
        expect(curveOwnership(undefined, 0)).toBe('none')
        expect(curveOwnership(Profile.createDefault(), 0)).toBe('none')
    })
})

describe('seeded curve', () => {
    it('holds the fan at its current duty across the span', () => {
        expect(seedCurve(42, 20, 100)).toEqual([
            [20, 42],
            [100, 42],
        ])
    })

    it('rounds and clamps the duty into the writable range', () => {
        expect(seedCurve(42.6, 20, 80)[0][1]).toBe(43)
        expect(seedCurve(140, 20, 80)[0][1]).toBe(100)
        expect(seedCurve(-5, 20, 80)[0][1]).toBe(0)
        expect(seedCurve(Number.NaN, 20, 80)[0][1]).toBe(0)
    })

    // The daemon rejects an empty speed profile, so a degenerate span must still
    // yield a point.
    it('yields a single point when the span is empty', () => {
        expect(seedCurve(30, 40, 40)).toEqual([[40, 30]])
    })
})

describe('seeded temp source', () => {
    const devices = [
        withTemps('gpu-1', DeviceType.GPU, ['GPU Temp']),
        withTemps('cpu-1', DeviceType.CPU, ['CPU Temp']),
        withTemps('fans-1', DeviceType.HWMON, []),
    ]

    it('keeps the temp the fan already follows', () => {
        const current = new ProfileTempSource('Liquid', 'aio-1')
        expect(seedTempSource(devices, 'fans-1', current)).toBe(current)
    })

    it('prefers a temp on the fans own device', () => {
        expect(seedTempSource(devices, 'gpu-1')).toEqual(new ProfileTempSource('GPU Temp', 'gpu-1'))
    })

    it('falls back to the cpu when the fans device has no temp', () => {
        expect(seedTempSource(devices, 'fans-1')).toEqual(
            new ProfileTempSource('CPU Temp', 'cpu-1'),
        )
    })

    it('falls back to any temp when there is no cpu', () => {
        const noCpu = [devices[2], devices[0]]
        expect(seedTempSource(noCpu, 'fans-1')).toEqual(new ProfileTempSource('GPU Temp', 'gpu-1'))
    })

    // A system with no temps at all cannot have a graph profile, and the caller
    // must not build one the daemon would reject.
    it('reports no temp source when the system has none', () => {
        expect(
            seedTempSource([withTemps('fans-1', DeviceType.HWMON, [])], 'fans-1'),
        ).toBeUndefined()
    })
})
