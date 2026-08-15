// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Per-fan curve ownership, and the temp a new curve follows.
 *
 * The simple interface edits a fan's curve in place, which is only honest when
 * the curve belongs to that fan alone. A profile shared with other fans would
 * drag them along, and a Mix, Overlay or Fixed profile is not a curve at all.
 * Both cases are reported rather than forked behind the user's back.
 */

import { DeviceType, type Device, type UID } from '@/models/Device.ts'
import { type Profile, ProfileTempSource, ProfileType } from '@/models/Profile.ts'

export type CurveOwnership =
    // A Graph profile no other channel uses: editable in place.
    | 'owned'
    // A Graph profile other channels use too.
    | 'shared'
    // A profile the simple interface cannot render as a curve (Mix, Overlay, Fixed).
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
 * The temp a new curve follows: the one the fan already follows, else a temp on
 * the fan's own device (an AIO's liquid temp, a GPU's core temp), else the
 * CPU's, else whatever the system has. A Graph profile the daemon will accept
 * needs one, and the simple interface never asks the user to pick.
 *
 * Read off the device's status, not its info: the profile editor builds its own
 * temp source list the same way, so an info-only temp would be a source the
 * editor then refuses to show.
 */
export function seedTempSource(
    devices: Iterable<Device>,
    deviceUID: UID,
    current?: ProfileTempSource,
): ProfileTempSource | undefined {
    if (current != null) return current
    const all = [...devices]
    const firstTempOf = (device: Device): ProfileTempSource | undefined => {
        const temp = device.status?.temps[0]
        return temp != null ? new ProfileTempSource(temp.name, device.uid) : undefined
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
