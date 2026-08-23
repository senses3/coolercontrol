// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { plainToInstance } from 'class-transformer'
import {
    alertIsSilenced,
    alertIsSilencedAt,
    AlertLog,
    AlertLogKind,
    alertSources,
    AlertsDTO,
    AlertState,
    alertToast,
} from '../Alert.ts'

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

    it('compares against a caller-supplied clock', () => {
        // The point of the -At form: a computed cannot depend on the wall clock, so it
        // has to hand in a moment it controls for an expiry to be observable at all.
        const dto = plainToInstance(AlertsDTO, daemonPayload as object)
        const alert = dto.alerts[0]
        const silencedUntil = Date.now() + 60_000
        alert.silenced_until = new Date(silencedUntil).toISOString()
        expect(alertIsSilencedAt(alert, silencedUntil - 1)).toBe(true)
        expect(alertIsSilencedAt(alert, silencedUntil)).toBe(false)
        expect(alertIsSilencedAt(alert, silencedUntil + 1)).toBe(false)
    })
})

// Only a log entry that crossed an alert-level edge interrupts the user, and
// `state` alone cannot say which machine moved.
describe('alertToast', () => {
    const log = (fields: Partial<AlertLog>): AlertLog =>
        plainToInstance(AlertLog, {
            uid: 'uid-1',
            name: 'Hot Tamale',
            state: AlertState.Active,
            message: 'temp1: too hot',
            timestamp: new Date().toISOString(),
            silenced: false,
            resolved: false,
            quiet: false,
            kind: AlertLogKind.Triggered,
            ...fields,
        } as object)

    it('withholds the toast for quiet and silenced entries', () => {
        expect(alertToast(log({ quiet: true }))).toBeNull()
        expect(alertToast(log({ silenced: true }))).toBeNull()
    })

    it('reads the kind, not the aggregate state', () => {
        // A second sensor going unreadable while the first still fires.
        const errored = log({ kind: AlertLogKind.Error, state: AlertState.Error })
        expect(alertToast(errored)?.summaryKey).toBe('views.alerts.alertError')
        // Same state, but the old state-only branch called this an error.
        const triggered = log({ kind: AlertLogKind.Triggered, state: AlertState.Error })
        expect(alertToast(triggered)?.summaryKey).toBe('views.alerts.alertTriggered')
    })

    it('announces sensors becoming readable while the alert still fires', () => {
        const readable = log({ kind: AlertLogKind.ErrorResolved, state: AlertState.Active })
        expect(alertToast(readable)).toEqual({
            severity: 'info',
            summaryKey: 'views.alerts.alertSensorsReadable',
            life: 3000,
        })
    })

    it('recovers only on the alert-level clearing edge', () => {
        const recovered = log({ kind: AlertLogKind.Resolved, state: AlertState.Inactive })
        expect(alertToast(recovered)?.summaryKey).toBe('views.alerts.alertRecovered')
    })

    it('falls back to the aggregate for entries written before kind existed', () => {
        const legacy = log({ kind: AlertLogKind.Unknown, state: AlertState.Inactive })
        expect(alertToast(legacy)?.summaryKey).toBe('views.alerts.alertRecovered')
        const legacyActive = log({ kind: AlertLogKind.Unknown, state: AlertState.Active })
        expect(alertToast(legacyActive)?.summaryKey).toBe('views.alerts.alertTriggered')
    })
})
