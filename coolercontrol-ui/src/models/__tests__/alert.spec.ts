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
import { plainToInstance } from 'class-transformer'
import { alertIsSilenced, alertSources, AlertsDTO, AlertState } from '../Alert.ts'

// class-transformer instantiates classes with NO constructor arguments and
// assigns the payload fields afterwards; the Alert constructor must tolerate
// that (a daemon payload once crashed on channel_sources[0] of undefined).
const daemonPayload = {
    alerts: [
        {
            uid: 'uid-1',
            name: 'Pump RPM',
            channel_source: {
                device_uid: 'dev-1',
                channel_name: 'pump',
                channel_metric: 'RPM',
            },
            channel_sources: [
                { device_uid: 'dev-1', channel_name: 'pump', channel_metric: 'RPM' },
                { device_uid: 'dev-1', channel_name: 'fan2', channel_metric: 'RPM' },
            ],
            min: 500,
            max: 10000,
            state: 'Inactive',
            source_states: [
                {
                    channel_source: {
                        device_uid: 'dev-1',
                        channel_name: 'pump',
                        channel_metric: 'RPM',
                    },
                    state: 'Inactive',
                },
                {
                    channel_source: {
                        device_uid: 'dev-1',
                        channel_name: 'fan2',
                        channel_metric: 'RPM',
                    },
                    state: 'Active',
                },
            ],
            warmup_duration: 1.0,
            cooldown_duration: 5.0,
            repeat_interval: 60.0,
            enabled: true,
            silenced_until: null,
            desktop_notify: true,
            desktop_notify_recovery: true,
            desktop_notify_audio: false,
            shutdown_on_activation: false,
        },
    ],
    logs: [
        {
            uid: 'uid-1',
            name: 'Pump RPM',
            state: 'Active',
            message: 'fan2: 0 is less than allowed minimum: 500',
            timestamp: '2026-07-17T00:00:00+00:00',
            silenced: true,
        },
    ],
}

describe('Alert deserialization', () => {
    it('deserializes a full daemon payload', () => {
        const dto = plainToInstance(AlertsDTO, daemonPayload as object)
        expect(dto.alerts).toHaveLength(1)
        const alert = dto.alerts[0]
        expect(alert.name).toBe('Pump RPM')
        expect(alert.channel_sources).toHaveLength(2)
        expect(alert.channel_source.channel_name).toBe('pump')
        expect(alert.source_states[1].state).toBe(AlertState.Active)
        expect(alert.cooldown_duration).toBe(5.0)
        expect(alert.repeat_interval).toBe(60.0)
        expect(alert.enabled).toBe(true)
        expect(dto.logs[0].silenced).toBe(true)
    })

    it('deserializes a pre-multi-source payload', () => {
        // An older daemon sends only the single channel_source and no new
        // fields; defaults must fill in and alertSources falls back.
        const legacy = {
            alerts: [
                {
                    uid: 'uid-2',
                    name: 'CPU Temp',
                    channel_source: {
                        device_uid: 'dev-1',
                        channel_name: 'temp1',
                        channel_metric: 'Temp',
                    },
                    min: 0,
                    max: 90,
                    state: 'Inactive',
                    warmup_duration: 1.0,
                    desktop_notify: true,
                    desktop_notify_recovery: true,
                    desktop_notify_audio: false,
                    shutdown_on_activation: false,
                },
            ],
            logs: [],
        }
        const dto = plainToInstance(AlertsDTO, legacy as object)
        const alert = dto.alerts[0]
        expect(alert.enabled).toBe(true)
        expect(alert.cooldown_duration).toBe(0)
        expect(alert.repeat_interval).toBe(0)
        expect(alertIsSilenced(alert)).toBe(false)
        expect(alertSources(alert)).toHaveLength(1)
        expect(alertSources(alert)[0].channel_name).toBe('temp1')
    })

    it('reports silenced only while the timestamp is in the future', () => {
        const dto = plainToInstance(AlertsDTO, daemonPayload as object)
        const alert = dto.alerts[0]
        expect(alertIsSilenced(alert)).toBe(false)
        alert.silenced_until = new Date(Date.now() + 60_000).toISOString()
        expect(alertIsSilenced(alert)).toBe(true)
        alert.silenced_until = new Date(Date.now() - 60_000).toISOString()
        expect(alertIsSilenced(alert)).toBe(false)
    })
})
