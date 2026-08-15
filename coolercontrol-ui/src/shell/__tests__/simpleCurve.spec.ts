// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Device.ts carries class-transformer decorators, which need the polyfill.
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { Device, DeviceType } from '@/models/Device.ts'
import { DeviceInfo } from '@/models/DeviceInfo.ts'
import { Profile, ProfileTempSource, ProfileType } from '@/models/Profile.ts'
import { Status, TempStatus } from '@/models/Status.ts'
import { TempInfo } from '@/models/TempInfo.ts'
import { curveOwnership, findOwnCurve, seedTempSource } from '@/shell/simple/simpleCurve.ts'

const graph = (uid: string): Profile => {
    const profile = new Profile('curve', ProfileType.Graph)
    profile.uid = uid
    return profile
}

// Reported temps, which is what the profile editor offers as a temp source.
const withTemps = (uid: string, type: DeviceType, temps: string[]): Device => {
    const status = new Status(
        '2026-01-01',
        temps.map((name) => new TempStatus(name, 40)),
    )
    return new Device(uid, uid, type, 1, undefined, new DeviceInfo(), [status])
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

describe('finding a fans own curve', () => {
    const named = (uid: string, name: string, type = ProfileType.Graph): Profile => {
        const profile = new Profile(name, type)
        profile.uid = uid
        return profile
    }

    // Switching to a fixed speed drops the assignment, so this is how the curve
    // is offered back instead of the user drawing a second one.
    it('finds the graph profile carrying the fans curve name', () => {
        const profiles = [named('p1', 'Other'), named('p2', 'CPU Fan Curve')]
        expect(findOwnCurve(profiles, 'CPU Fan Curve')?.uid).toBe('p2')
    })

    // The name alone is not enough: only a graph is a curve this page can edit.
    it('ignores a profile of another type with the same name', () => {
        const profiles = [named('p1', 'CPU Fan Curve', ProfileType.Fixed)]
        expect(findOwnCurve(profiles, 'CPU Fan Curve')).toBeUndefined()
    })

    it('reports nothing when no curve carries the name', () => {
        expect(findOwnCurve([named('p1', 'Other')], 'CPU Fan Curve')).toBeUndefined()
        expect(findOwnCurve([], 'CPU Fan Curve')).toBeUndefined()
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

    // A device can describe a temp it is not currently reporting; the editor
    // builds its list from the reported ones, so this must too.
    it('ignores a temp the device describes but does not report', () => {
        const info = new DeviceInfo()
        info.temps.set('Ghost', new TempInfo('Ghost', 1))
        const quiet = new Device('quiet-1', 'quiet-1', DeviceType.HWMON, 1, undefined, info)
        expect(seedTempSource([quiet], 'quiet-1')).toBeUndefined()
    })
})
