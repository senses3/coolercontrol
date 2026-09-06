// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import {
    CCChannelSettings,
    CoolerControlDeviceSettingsDTO,
    isFirmwareCurveEnabled,
} from '../CCSettings.ts'
import { ChannelExtensionNames } from '../SpeedOptions.ts'

// What the daemon sends for GET /settings/devices.
const daemonPayload = {
    uid: 'device-uid',
    name: 'nct6687',
    disable: false,
    extensions: {},
    channel_settings: {
        fan2: { label: 'Pump', disabled: true },
        fan3: { label: 'Rear', disabled: false, extension: { auto_hw_curve_enabled: true } },
    },
}

describe('CoolerControlDeviceSettingsDTO', () => {
    // The channel_settings map was deserialized as ChannelInfo, a different model whose fields
    // (lcd_modes, lighting_modes) then rode along back to the daemon on every save. The declared
    // type said CCChannelSettings, so nothing caught it.
    it('deserializes channel settings as CCChannelSettings', () => {
        const settings = plainToInstance(CoolerControlDeviceSettingsDTO, daemonPayload)

        const fan2 = settings.channel_settings.get('fan2')
        expect(fan2).toBeInstanceOf(CCChannelSettings)
        expect(fan2?.label).toBe('Pump')
        expect(fan2?.disabled).toBe(true)
    })

    // A save sends the whole device settings object back, so anything the deserializer invents is
    // written to the daemon's config as well.
    it('sends back only the fields the daemon owns', () => {
        const settings = plainToInstance(CoolerControlDeviceSettingsDTO, daemonPayload)

        // What actually reaches the daemon: JSON drops the undefined optionals.
        const wire = JSON.parse(JSON.stringify(instanceToPlain(settings))) as {
            channel_settings: Record<string, Record<string, unknown>>
        }

        expect(Object.keys(wire.channel_settings.fan2).sort()).toEqual(['disabled', 'label'])
        expect(Object.keys(wire.channel_settings.fan3).sort()).toEqual([
            'disabled',
            'extension',
            'label',
        ])
        expect(wire.channel_settings.fan3.extension).toEqual({ auto_hw_curve_enabled: true })
    })

    // Channels the user never touched carry no settings entry at all, and a fresh one must not
    // claim the channel is disabled.
    it('defaults a new channel setting to enabled', () => {
        const fresh = new CCChannelSettings()

        expect(fresh.disabled).toBe(false)
        expect(fresh.label).toBeUndefined()
    })
})

describe('isFirmwareCurveEnabled', () => {
    it('pairs each extension with its own flag', () => {
        expect(
            isFirmwareCurveEnabled(ChannelExtensionNames.AutoHWCurve, {
                auto_hw_curve_enabled: true,
            }),
        ).toBe(true)
        expect(
            isFirmwareCurveEnabled(ChannelExtensionNames.AmdRdnaGpu, {
                hw_fan_curve_enabled: true,
            }),
        ).toBe(true)
    })

    // Each extension writes its own flag, so the other one is either stale or
    // belongs to a different channel; treating it as on would badge a channel
    // the firmware does not actually drive.
    it('ignores the flag of the other extension', () => {
        expect(
            isFirmwareCurveEnabled(ChannelExtensionNames.AutoHWCurve, {
                hw_fan_curve_enabled: true,
            }),
        ).toBe(false)
        expect(
            isFirmwareCurveEnabled(ChannelExtensionNames.AmdRdnaGpu, {
                auto_hw_curve_enabled: true,
            }),
        ).toBe(false)
    })

    it('is false without an extension or without settings', () => {
        expect(isFirmwareCurveEnabled(undefined, { auto_hw_curve_enabled: true })).toBe(false)
        expect(isFirmwareCurveEnabled(ChannelExtensionNames.AutoHWCurve, undefined)).toBe(false)
        expect(isFirmwareCurveEnabled(ChannelExtensionNames.AutoHWCurve, {})).toBe(false)
    })
})
