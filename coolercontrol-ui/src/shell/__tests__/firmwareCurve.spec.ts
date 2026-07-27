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

// The app loads reflect-metadata via an injected script, tests must import it themselves.
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { ChannelExtensionNames } from '@/models/SpeedOptions.ts'
import { type Profile, ProfileType } from '@/models/Profile.ts'
import { firmwareCurveApplicable } from '../cooling/firmwareCurve.ts'

const DEVICE = 'dev-1'

function profile(
    p_type: ProfileType,
    tempDevice: string | undefined = DEVICE,
    temp_name = 'temp1',
): Profile {
    return {
        p_type,
        temp_source: tempDevice == null ? undefined : { device_uid: tempDevice, temp_name },
    } as unknown as Profile
}

describe('firmwareCurveApplicable', () => {
    it('accepts a graph profile reading the same device', () => {
        expect(
            firmwareCurveApplicable(
                profile(ProfileType.Graph),
                DEVICE,
                ChannelExtensionNames.AutoHWCurve,
            ),
        ).toBe(true)
    })

    // The daemon has to compute anything the device cannot evaluate itself, so
    // an enabled flag on these must not read as firmware-driven.
    it('rejects profile kinds the device cannot run', () => {
        for (const kind of [
            ProfileType.Mix,
            ProfileType.Fixed,
            ProfileType.Default,
            ProfileType.Overlay,
        ]) {
            expect(
                firmwareCurveApplicable(profile(kind), DEVICE, ChannelExtensionNames.AutoHWCurve),
                kind,
            ).toBe(false)
        }
    })

    it('rejects a graph profile sourcing another device', () => {
        expect(
            firmwareCurveApplicable(
                profile(ProfileType.Graph, 'other-device'),
                DEVICE,
                ChannelExtensionNames.AutoHWCurve,
            ),
        ).toBe(false)
    })

    it('rejects a missing profile', () => {
        expect(firmwareCurveApplicable(undefined, DEVICE, ChannelExtensionNames.AutoHWCurve)).toBe(
            false,
        )
    })

    // AMD RDNA GPUs can only follow their own temp1.
    it('narrows AMD RDNA channels to temp1', () => {
        expect(
            firmwareCurveApplicable(
                profile(ProfileType.Graph, DEVICE, 'temp1'),
                DEVICE,
                ChannelExtensionNames.AmdRdnaGpu,
            ),
        ).toBe(true)
        expect(
            firmwareCurveApplicable(
                profile(ProfileType.Graph, DEVICE, 'temp2'),
                DEVICE,
                ChannelExtensionNames.AmdRdnaGpu,
            ),
        ).toBe(false)
    })
})
