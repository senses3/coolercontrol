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

// Pure profile-curve resolution for the cooling landing mini graphs, revived
// from the 4.3.1 SpeedGraph/Overlay/Mix charts. Graph profiles draw their
// speed curve; Overlay profiles draw the effective (offset-applied) curve over
// a faint base; Mix profiles draw one line per member, since members with
// different temp sources cannot reduce to a single duty-vs-temp curve.

import { Profile, ProfileType, type ProfileTempSource } from '@/models/Profile.ts'

// A mini stays readable with only a few lines; larger mixes draw the first
// MAX_MINI_CURVES members in order.
export const MAX_MINI_CURVES = 4
const SAMPLE_STEP = 2

export interface MiniCurve {
    // The temp source driving this line; the component uses it for the line
    // color and the live operating point.
    tempSource?: ProfileTempSource
    // Sampled [temp, duty] points across the set's temp range.
    points: Array<[number, number]>
    // Overlay base curve, drawn de-emphasized under the effective curve.
    isBase: boolean
    // Evaluates this line's duty at a temperature (for the live dot).
    dutyAt: (temp: number) => number
}

export interface MiniCurveSet {
    curves: MiniCurve[]
    tempMin: number
    tempMax: number
    // Members beyond MAX_MINI_CURVES that are not drawn.
    truncated: number
}

// Direct port of the daemon's interpolation (via the 4.3.1 SpeedOverlayChart):
// clamps to the first/last step outside the profile range, linear in between.
export function interpolateProfile(speedProfile: Array<[number, number]>, temp: number): number {
    let stepBelow = speedProfile[0]
    let stepAbove = speedProfile[speedProfile.length - 1]
    for (const step of speedProfile) {
        if (step[0] <= temp) stepBelow = step
        if (step[0] >= temp) {
            stepAbove = step
            break
        }
    }
    if (stepBelow[0] === stepAbove[0]) return stepBelow[1]
    return (
        stepBelow[1] +
        ((temp - stepBelow[0]) / (stepAbove[0] - stepBelow[0])) * (stepAbove[1] - stepBelow[1])
    )
}

// Same shape as interpolateProfile, over duty -> offset pairs.
export function interpolateOffsetProfile(
    offsetProfile: Array<[number, number]>,
    duty: number,
): number {
    return interpolateProfile(offsetProfile, duty)
}

const clampDuty = (duty: number): number => Math.min(100, Math.max(0, duty))

// Graph profiles that actually supply a drawable line for a mix/overlay,
// flattening nested Mix members. Cycles are guarded by the seen set.
function flattenToGraphs(profile: Profile, allProfiles: Profile[], seen: Set<string>): Profile[] {
    if (seen.has(profile.uid)) return []
    seen.add(profile.uid)
    if (profile.p_type === ProfileType.Graph) {
        return profile.speed_profile.length > 0 ? [profile] : []
    }
    if (profile.p_type === ProfileType.Mix || profile.p_type === ProfileType.Overlay) {
        const members: Profile[] = []
        for (const uid of profile.member_profile_uids) {
            const member = allProfiles.find((candidate) => candidate.uid === uid)
            if (member != null) members.push(...flattenToGraphs(member, allProfiles, seen))
        }
        return members
    }
    return []
}

function sampleCurve(
    dutyAt: (temp: number) => number,
    tempMin: number,
    tempMax: number,
): Array<[number, number]> {
    const points: Array<[number, number]> = []
    for (let temp = tempMin; temp < tempMax; temp += SAMPLE_STEP) {
        points.push([temp, dutyAt(temp)])
    }
    points.push([tempMax, dutyAt(tempMax)])
    return points
}

function tempRangeOf(graphs: Profile[]): [number, number] {
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (const graph of graphs) {
        if (graph.speed_profile.length === 0) continue
        min = Math.min(min, graph.speed_profile[0][0])
        max = Math.max(max, graph.speed_profile[graph.speed_profile.length - 1][0])
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 100]
    if (min === max) return [min - 10, max + 10]
    return [min, max]
}

// Resolves the mini curve set for an assigned profile, or null when the
// profile has no drawable curve (Fixed/Default: the caller falls back to the
// live sparkline).
export function resolveMiniCurves(profile: Profile, allProfiles: Profile[]): MiniCurveSet | null {
    switch (profile.p_type) {
        case ProfileType.Graph: {
            if (profile.speed_profile.length === 0) return null
            const [tempMin, tempMax] = tempRangeOf([profile])
            const dutyAt = (temp: number): number =>
                clampDuty(interpolateProfile(profile.speed_profile, temp))
            return {
                curves: [
                    {
                        tempSource: profile.temp_source,
                        points: sampleCurve(dutyAt, tempMin, tempMax),
                        isBase: false,
                        dutyAt,
                    },
                ],
                tempMin,
                tempMax,
                truncated: 0,
            }
        }
        case ProfileType.Mix: {
            const graphs = flattenToGraphs(profile, allProfiles, new Set())
            if (graphs.length === 0) return null
            const drawn = graphs.slice(0, MAX_MINI_CURVES)
            const [tempMin, tempMax] = tempRangeOf(drawn)
            return {
                curves: drawn.map((graph) => {
                    const dutyAt = (temp: number): number =>
                        clampDuty(interpolateProfile(graph.speed_profile, temp))
                    return {
                        tempSource: graph.temp_source,
                        points: sampleCurve(dutyAt, tempMin, tempMax),
                        isBase: false,
                        dutyAt,
                    }
                }),
                tempMin,
                tempMax,
                truncated: graphs.length - drawn.length,
            }
        }
        case ProfileType.Overlay: {
            const graphs = flattenToGraphs(profile, allProfiles, new Set())
            if (graphs.length === 0) return null
            const drawn = graphs.slice(0, MAX_MINI_CURVES)
            const [tempMin, tempMax] = tempRangeOf(drawn)
            const curves: MiniCurve[] = []
            for (const graph of drawn) {
                const baseAt = (temp: number): number =>
                    interpolateProfile(graph.speed_profile, temp)
                // The daemon clamps applied duties, so the effective line is
                // clamped too (unlike the full-size editor's simulation).
                const effectiveAt = (temp: number): number => {
                    const base = baseAt(temp)
                    return clampDuty(base + interpolateOffsetProfile(profile.offset_profile, base))
                }
                curves.push({
                    tempSource: graph.temp_source,
                    points: sampleCurve((temp) => clampDuty(baseAt(temp)), tempMin, tempMax),
                    isBase: true,
                    dutyAt: (temp) => clampDuty(baseAt(temp)),
                })
                curves.push({
                    tempSource: graph.temp_source,
                    points: sampleCurve(effectiveAt, tempMin, tempMax),
                    isBase: false,
                    dutyAt: effectiveAt,
                })
            }
            return { curves, tempMin, tempMax, truncated: graphs.length - drawn.length }
        }
        default:
            return null
    }
}

// ----- live sparkline scaling (A+B) -----

// Auto-scale keeps small real movement visible without inventing noise: the
// Y range fits the data but never zooms tighter than MIN_DUTY_SPAN, so a
// steady channel still draws honestly flat.
export const MIN_DUTY_SPAN = 15

export function sparklineRange(duties: number[]): [number, number] {
    let min = Math.min(...duties)
    let max = Math.max(...duties)
    if (max - min < MIN_DUTY_SPAN) {
        const mid = (min + max) / 2
        min = mid - MIN_DUTY_SPAN / 2
        max = mid + MIN_DUTY_SPAN / 2
        if (min < 0) {
            max -= min
            min = 0
        } else if (max > 100) {
            min -= max - 100
            max = 100
        }
    }
    return [min, max]
}
