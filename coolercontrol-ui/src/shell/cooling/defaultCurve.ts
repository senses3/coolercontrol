// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The curve a new Graph profile starts from: a straight ramp across the temp
 * source's usable range, from off to full.
 *
 * One definition, because the profile editor and the new-profile wizard both
 * open on it and must agree about what a new profile is.
 */

/** Point count, when the device's own limits leave room for it. */
const PREFERRED_POINTS = 5

/** The editors' default temp axis, which is what a placeholder curve spans. */
const PLACEHOLDER_TEMP_MIN = 0
const PLACEHOLDER_TEMP_MAX = 100

const round = (value: number, precision: number): number => {
    const multiplier = Math.pow(10, precision)
    return Math.round(value * multiplier) / multiplier
}

/** Evenly spaced values from start to stop, inclusive of both ends. */
function lineSpace(
    startValue: number,
    stopValue: number,
    cardinality: number,
    precision: number,
): Array<number> {
    const values: Array<number> = []
    const step = (stopValue - startValue) / (cardinality - 1)
    for (let index = 0; index < cardinality; index++) {
        values.push(round(startValue + step * index, precision))
    }
    return values
}

/**
 * `tempMin`/`tempMax` are the temp source device's range, already clamped to
 * the axis the caller draws. `profileMinLength`/`profileMaxLength` are that
 * device's own limits on how many points a profile may carry.
 */
export function defaultGraphCurve(
    tempMin: number,
    tempMax: number,
    profileMinLength: number,
    profileMaxLength: number,
): Array<[number, number]> {
    const points =
        profileMinLength <= PREFERRED_POINTS && profileMaxLength >= PREFERRED_POINTS
            ? PREFERRED_POINTS
            : profileMaxLength
    const temps = lineSpace(tempMin, tempMax, points, 1)
    const duties = lineSpace(0, 100, points, 0)
    return temps.map((temp, index): [number, number] => [temp, duties[index]])
}

/**
 * The curve an editor draws before a temp source has been chosen: the same ramp
 * across the default axis, since no device has named a range or a point limit
 * yet. A placeholder still has to land on the chart, so it stays inside the axis
 * the editor opens with.
 */
export function placeholderGraphCurve(): Array<[number, number]> {
    return defaultGraphCurve(
        PLACEHOLDER_TEMP_MIN,
        PLACEHOLDER_TEMP_MAX,
        PREFERRED_POINTS,
        PREFERRED_POINTS,
    )
}
