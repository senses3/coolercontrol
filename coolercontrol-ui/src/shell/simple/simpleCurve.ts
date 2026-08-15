// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Per-fan curve ownership, and the seed for a fan that needs one.
 *
 * Simple mode edits a fan's curve in place, which is only honest when the curve
 * belongs to that fan alone. A profile shared with other fans would drag them
 * along, and a Mix, Overlay or Fixed profile is not a curve at all. Both cases
 * are reported rather than forked behind the user's back.
 */

import { DeviceType, type Device, type UID } from '@/models/Device.ts'
import { type Profile, ProfileTempSource, ProfileType } from '@/models/Profile.ts'

export type CurveOwnership =
    // A Graph profile no other channel uses: editable in place.
    | 'owned'
    // A Graph profile other channels use too.
    | 'shared'
    // A profile simple mode cannot render as a curve (Mix, Overlay, Fixed).
    | 'unsupported'
    // No profile assigned yet.
    | 'none'

export function curveOwnership(
    profile: Profile | undefined,
    otherChannelCount: number,
): CurveOwnership {
    if (profile == null || profile.uid === '0') return 'none'
    if (profile.p_type !== ProfileType.Graph) return 'unsupported'
    return otherChannelCount > 0 ? 'shared' : 'owned'
}

/**
 * A flat curve at the fan's current duty. Seeding from what the fan is doing
 * right now means turning a fan over to a curve never changes its speed; the
 * shape is then the user's to draw, in the editor that opens right below.
 */
export function seedCurve(duty: number, tempMin: number, tempMax: number): Array<[number, number]> {
    const held = Math.round(Math.min(100, Math.max(0, Number.isFinite(duty) ? duty : 0)))
    const low = Math.round(tempMin)
    const high = Math.round(tempMax)
    return high > low
        ? [
              [low, held],
              [high, held],
          ]
        : [[low, held]]
}

/**
 * The temp a seeded curve follows: the one the fan already follows, else a temp
 * on the fan's own device (an AIO's liquid temp, a GPU's core temp), else the
 * CPU's, else whatever the system has. A Graph profile the daemon will accept
 * needs one, and simple mode never asks the user to pick.
 */
export function seedTempSource(
    devices: Iterable<Device>,
    deviceUID: UID,
    current?: ProfileTempSource,
): ProfileTempSource | undefined {
    if (current != null) return current
    const all = [...devices]
    const firstTempOf = (device: Device): ProfileTempSource | undefined => {
        for (const tempName of device.info?.temps.keys() ?? []) {
            return new ProfileTempSource(tempName, device.uid)
        }
        return undefined
    }
    const own = all.find((device) => device.uid === deviceUID)
    const ownTemp = own != null ? firstTempOf(own) : undefined
    if (ownTemp != null) return ownTemp
    const cpu = all.find((device) => device.type === DeviceType.CPU)
    const cpuTemp = cpu != null ? firstTempOf(cpu) : undefined
    if (cpuTemp != null) return cpuTemp
    for (const device of all) {
        const temp = firstTempOf(device)
        if (temp != null) return temp
    }
    return undefined
}
