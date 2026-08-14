// SPDX-FileCopyrightText: 2022 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { UID } from '@/models/Device.ts'
import { Type } from 'class-transformer'
import { ChannelMetric, ChannelSource } from '@/models/ChannelSource.ts'
import { v4 as uuidV4 } from 'uuid'
import i18n from '@/i18n'
import { mdiAlertCircle, mdiBellOutline, mdiBellRingOutline, mdiHelp } from '@mdi/js'

export class Alert {
    uid: UID = uuidV4()
    name: string
    /** Legacy single source; mirrors channel_sources[0]. */
    channel_source: ChannelSource
    /** All watched sources; every entry shares the same ChannelMetric. */
    channel_sources: Array<ChannelSource> = []
    min: number
    max: number
    warmup_duration: number
    /** Seconds the value must stay back in range before an Active alert clears. */
    cooldown_duration: number = 0
    /** Seconds between repeated notifications while Active; 0 disables. */
    repeat_interval: number = 0
    /** A disabled alert is not evaluated at all. */
    enabled: boolean = true
    /** While set to a future time, notifications and shutdown are suppressed. */
    silenced_until?: string
    desktop_notify: boolean = true
    desktop_notify_recovery: boolean = true
    desktop_notify_audio: boolean = false
    shutdown_on_activation: boolean = false
    state?: AlertState
    /** Per-source states, parallel to channel_sources. Output-only. */
    source_states: Array<SourceState> = []

    constructor(
        name: string,
        channel_sources: Array<ChannelSource>,
        min: number,
        max: number,
        warmup_duration: number,
    ) {
        this.name = name
        // class-transformer instantiates with no arguments and assigns the
        // payload fields afterwards, so every argument may be undefined here.
        this.channel_sources = channel_sources ?? []
        this.channel_source =
            this.channel_sources[0] ?? new ChannelSource('', '', ChannelMetric.Temp)
        this.min = min
        this.max = max
        this.warmup_duration = warmup_duration
    }
}

export interface SourceState {
    channel_source: ChannelSource
    state: AlertState
}

/** The watched sources, tolerating pre-multi-source payloads. */
export function alertSources(alert: Alert): Array<ChannelSource> {
    return alert.channel_sources.length > 0 ? alert.channel_sources : [alert.channel_source]
}

/** True while a user-set silence timestamp lies in the future. */
export function alertIsSilenced(alert: Alert): boolean {
    return alertIsSilencedAt(alert, Date.now())
}

// Takes the moment to compare against, so a caller inside a computed can depend on a
// clock it controls. Reading the wall clock directly makes an expiring silence
// invisible to Vue: nothing reactive changes when the timestamp simply passes.
export function alertIsSilencedAt(alert: Alert, nowMillis: number): boolean {
    return alert.silenced_until != null && new Date(alert.silenced_until).getTime() > nowMillis
}

export enum AlertState {
    Active = 'Active',
    Inactive = 'Inactive',
    Error = 'Error',
}

/**
 * 获取AlertState的本地化显示名称
 * @param state AlertState枚举值
 * @returns 本地化的显示名称
 */
export function getAlertStateDisplayName(state: AlertState): string {
    const { t } = i18n.global
    switch (state) {
        case AlertState.Active:
            return t('models.alertState.active')
        case AlertState.Inactive:
            return t('models.alertState.inactive')
        case AlertState.Error:
            return t('models.alertState.error')
        default:
            return String(state)
    }
}

export function getAlertStateIcon(state: AlertState): string {
    switch (state) {
        case AlertState.Active:
            return mdiBellRingOutline
        case AlertState.Inactive:
            return mdiBellOutline
        case AlertState.Error:
            return mdiAlertCircle
        default:
            return mdiHelp
    }
}

export class AlertLog {
    uid: UID
    name: string
    state: AlertState
    message: string
    timestamp: string
    /** The change happened while silenced; update state but raise no toast. */
    silenced: boolean = false
    /** The change was a source recovery; toast it as informational even
     *  when other sources keep the alert Active. */
    resolved: boolean = false

    constructor(uid: UID, name: string, state: AlertState, message: string, timestamp: string) {
        this.uid = uid
        this.name = name
        this.state = state
        this.message = message
        this.timestamp = timestamp
    }
}

export class AlertsDTO {
    @Type(() => Alert)
    alerts: Array<Alert> = []
    @Type(() => AlertLog)
    logs: Array<AlertLog> = []
}
