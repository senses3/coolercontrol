// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Profile.ts carries class-transformer decorators; the app loads
// reflect-metadata via an injected script, tests must import it themselves.
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { Profile, ProfileTempSource, ProfileType } from '@/models/Profile.ts'
import {
    currentProfileDuty,
    interpolateProfile,
    MAX_MINI_CURVES,
    MIN_DUTY_SPAN,
    resolveMiniCurves,
    sparklineRange,
} from '@/shell/cooling/profileCurve.ts'
import { ProfileMixFunctionType } from '@/models/Profile.ts'

const source = new ProfileTempSource('CPU Temp', 'device-1')
const graph = (name: string, points: Array<[number, number]>): Profile =>
    new Profile(name, ProfileType.Graph, undefined, source, points)

describe('interpolateProfile', () => {
    const curve: Array<[number, number]> = [
        [20, 10],
        [60, 50],
        [80, 100],
    ]
    it('interpolates linearly between steps', () => {
        expect(interpolateProfile(curve, 40)).toBe(30)
        expect(interpolateProfile(curve, 70)).toBe(75)
    })
    it('returns exact step duties', () => {
        expect(interpolateProfile(curve, 60)).toBe(50)
    })
    it('clamps outside the profile range', () => {
        expect(interpolateProfile(curve, 0)).toBe(10)
        expect(interpolateProfile(curve, 100)).toBe(100)
    })
})

describe('resolveMiniCurves', () => {
    it('returns null for fixed and default profiles', () => {
        expect(resolveMiniCurves(new Profile('f', ProfileType.Fixed, 50), [])).toBeNull()
        expect(resolveMiniCurves(Profile.createDefault(), [])).toBeNull()
    })

    it('resolves a graph profile to one curve over its temp range', () => {
        const profile = graph('g', [
            [30, 20],
            [70, 80],
        ])
        const set = resolveMiniCurves(profile, [profile])!
        expect(set.curves).toHaveLength(1)
        expect(set.tempMin).toBe(30)
        expect(set.tempMax).toBe(70)
        expect(set.curves[0].dutyAt(50)).toBe(50)
        const last = set.curves[0].points[set.curves[0].points.length - 1]
        expect(last).toEqual([70, 80])
    })

    it('draws one line per mix member and flattens nested mixes', () => {
        const memberA = graph('a', [[20, 20]])
        const memberB = graph('b', [[80, 80]])
        const inner = new Profile('inner', ProfileType.Mix, undefined, undefined, [], [memberB.uid])
        const mix = new Profile(
            'mix',
            ProfileType.Mix,
            undefined,
            undefined,
            [],
            [memberA.uid, inner.uid],
        )
        const set = resolveMiniCurves(mix, [memberA, memberB, inner, mix])!
        expect(set.curves).toHaveLength(2)
        expect(set.tempMin).toBe(20)
        expect(set.tempMax).toBe(80)
        expect(set.truncated).toBe(0)
    })

    it('caps drawn mix members and reports the truncation', () => {
        const members = Array.from({ length: MAX_MINI_CURVES + 2 }, (_, index) =>
            graph(`m${index}`, [[20 + index, 30]]),
        )
        const mix = new Profile(
            'mix',
            ProfileType.Mix,
            undefined,
            undefined,
            [],
            members.map((member) => member.uid),
        )
        const set = resolveMiniCurves(mix, [...members, mix])!
        expect(set.curves).toHaveLength(MAX_MINI_CURVES)
        expect(set.truncated).toBe(2)
    })

    it('overlay draws base and clamped effective curves', () => {
        const base = graph('base', [
            [20, 20],
            [80, 95],
        ])
        const overlay = new Profile(
            'over',
            ProfileType.Overlay,
            undefined,
            undefined,
            [],
            [base.uid],
            undefined,
            [
                [0, 15],
                [100, 15],
            ],
        )
        const set = resolveMiniCurves(overlay, [base, overlay])!
        expect(set.curves).toHaveLength(2)
        const baseCurve = set.curves.find((curve) => curve.isBase)!
        const effective = set.curves.find((curve) => !curve.isBase)!
        expect(baseCurve.dutyAt(20)).toBe(20)
        expect(effective.dutyAt(20)).toBe(35)
        // 95 + 15 clamps to 100.
        expect(effective.dutyAt(80)).toBe(100)
    })

    it('survives member cycles', () => {
        const mix = new Profile('mix', ProfileType.Mix, undefined, undefined, [], [])
        mix.member_profile_uids = [mix.uid]
        expect(resolveMiniCurves(mix, [mix])).toBeNull()
    })
})

describe('sparklineRange', () => {
    it('fits the data when the span is large enough', () => {
        expect(sparklineRange([10, 90])).toEqual([10, 90])
    })
    it('enforces the minimum span around the midpoint', () => {
        const [min, max] = sparklineRange([48, 52])
        expect(max - min).toBe(MIN_DUTY_SPAN)
        expect(min).toBeLessThan(48)
        expect(max).toBeGreaterThan(52)
    })
    it('shifts the span inside 0..100 at the edges', () => {
        expect(sparklineRange([0, 2])).toEqual([0, MIN_DUTY_SPAN])
        expect(sparklineRange([99, 100])).toEqual([100 - MIN_DUTY_SPAN, 100])
    })
})

// The Target a chart draws: what a profile is asking for right now, whatever it is built from.
describe('currentProfileDuty', () => {
    const at = (temp: number | undefined) => () => temp

    it('reads a graph profile off its temp source', () => {
        const profile = graph('cpu', [
            [20, 10],
            [80, 100],
        ])
        expect(currentProfileDuty(profile, [profile], at(50))).toBe(55)
    })

    it('is zero when the temp source has no reading yet', () => {
        const profile = graph('cpu', [
            [20, 10],
            [80, 100],
        ])
        expect(currentProfileDuty(profile, [profile], at(undefined))).toBe(0)
    })

    it('takes a fixed profile at its duty', () => {
        const fixed = new Profile('fixed', ProfileType.Fixed)
        fixed.speed_fixed = 42
        expect(currentProfileDuty(fixed, [fixed], at(50))).toBe(42)
    })

    it('reduces a mix through its function', () => {
        const cool = graph('cool', [
            [20, 20],
            [80, 20],
        ])
        const hot = graph('hot', [
            [20, 70],
            [80, 70],
        ])
        const mix = new Profile('mix', ProfileType.Mix)
        mix.member_profile_uids = [cool.uid, hot.uid]
        mix.mix_function_type = ProfileMixFunctionType.Max
        expect(currentProfileDuty(mix, [cool, hot, mix], at(50))).toBe(70)
        mix.mix_function_type = ProfileMixFunctionType.Avg
        expect(currentProfileDuty(mix, [cool, hot, mix], at(50))).toBe(45)
    })

    it('applies an overlay offset to its base', () => {
        const base = graph('base', [
            [20, 40],
            [80, 40],
        ])
        const overlay = new Profile('overlay', ProfileType.Overlay)
        overlay.member_profile_uids = [base.uid]
        overlay.offset_profile = [
            [0, 10],
            [100, 10],
        ]
        expect(currentProfileDuty(overlay, [base, overlay], at(50))).toBe(50)
    })

    it('clamps an overlay that would push past full speed', () => {
        const base = graph('base', [
            [20, 95],
            [80, 95],
        ])
        const overlay = new Profile('overlay', ProfileType.Overlay)
        overlay.member_profile_uids = [base.uid]
        overlay.offset_profile = [
            [0, 20],
            [100, 20],
        ]
        expect(currentProfileDuty(overlay, [base, overlay], at(50))).toBe(100)
    })

    it('counts a profile used by two members twice, but terminates on a cycle', () => {
        const member = graph('member', [
            [20, 30],
            [80, 30],
        ])
        const sum = new Profile('sum', ProfileType.Mix)
        sum.member_profile_uids = [member.uid, member.uid]
        sum.mix_function_type = ProfileMixFunctionType.Sum
        expect(currentProfileDuty(sum, [member, sum], at(50))).toBe(60)

        const cycle = new Profile('cycle', ProfileType.Mix)
        cycle.member_profile_uids = [cycle.uid]
        cycle.mix_function_type = ProfileMixFunctionType.Max
        expect(currentProfileDuty(cycle, [cycle], at(50))).toBe(0)
    })
})
