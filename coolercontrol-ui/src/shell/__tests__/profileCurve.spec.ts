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

// Profile.ts carries class-transformer decorators; the app loads
// reflect-metadata via an injected script, tests must import it themselves.
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { Profile, ProfileTempSource, ProfileType } from '@/models/Profile.ts'
import {
    interpolateProfile,
    MAX_MINI_CURVES,
    MIN_DUTY_SPAN,
    resolveMiniCurves,
    sparklineRange,
} from '@/shell/cooling/profileCurve.ts'

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
