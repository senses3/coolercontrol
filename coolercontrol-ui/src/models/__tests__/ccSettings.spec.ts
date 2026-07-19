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

import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { CCChannelSettings, CoolerControlDeviceSettingsDTO } from '../CCSettings.ts'

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
