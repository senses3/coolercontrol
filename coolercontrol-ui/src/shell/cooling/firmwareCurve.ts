// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { ChannelExtensionNames } from '@/models/SpeedOptions.ts'
import { type Profile, ProfileType } from '@/models/Profile.ts'
import type { UID } from '@/models/Device.ts'

/**
 * Whether the firmware could take over this channel for the given profile.
 *
 * The device can only run the curve itself when it is a plain Graph profile
 * reading a temp on that same device: a Mix profile, or one sourcing another
 * device's sensor, has to be computed by the daemon. AMD RDNA GPUs narrow it
 * further to their own `temp1`.
 *
 * The enabled flag alone does not mean the firmware is driving the fan, so the
 * settings switch and the cooling badges both gate on this.
 */
export function firmwareCurveApplicable(
    profile: Profile | undefined,
    deviceUID: UID,
    extension: ChannelExtensionNames | undefined,
): boolean {
    if (profile == null) return false
    if (profile.p_type !== ProfileType.Graph) return false
    if (profile.temp_source?.device_uid !== deviceUID) return false
    return (
        extension !== ChannelExtensionNames.AmdRdnaGpu || profile.temp_source?.temp_name === 'temp1'
    )
}
