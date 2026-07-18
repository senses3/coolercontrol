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

import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { Alert, alertIsSilenced, alertSources, AlertState } from '@/models/Alert.ts'
import { ChannelMetric, ChannelSource } from '@/models/ChannelSource.ts'
import type { UID } from '@/models/Device.ts'

/**
 * UI mirror of the daemon's calibration alert gate, for wizard and panel
 * hints. The daemon remains authoritative: it rejects a blocked start and
 * suppresses non-Temp alert sources on a channel only while its own sweep
 * runs. Callers should refresh alerts (loadAlertsAndLogs) on open so the
 * per-source states are current.
 */
export function useAlertCalibrationGuard() {
    const settingsStore = useSettingsStore()

    const nonTempSourcesOn = (
        alert: Alert,
        deviceUID: UID,
        channelName: string,
    ): Array<ChannelSource> =>
        alertSources(alert).filter(
            (source) =>
                source.channel_metric !== ChannelMetric.Temp &&
                source.device_uid === deviceUID &&
                source.channel_name === channelName,
        )

    const sourceIsActive = (alert: Alert, source: ChannelSource): boolean => {
        if (alert.source_states.length === 0) {
            // Older payloads without per-source states: the alert state is
            // all we have.
            return alert.state === AlertState.Active
        }
        return alert.source_states.some(
            (sourceState) =>
                sourceState.channel_source.device_uid === source.device_uid &&
                sourceState.channel_source.channel_name === source.channel_name &&
                sourceState.channel_source.channel_metric === source.channel_metric &&
                sourceState.state === AlertState.Active,
        )
    }

    /**
     * The name of an enabled, unsilenced alert currently Active on the
     * channel via a non-Temp source, if any. Such a channel cannot be
     * calibrated: the alert was not caused by a sweep.
     */
    const blockingAlertName = (deviceUID: UID, channelName: string): string | undefined => {
        for (const alert of settingsStore.alerts) {
            if (!alert.enabled || alertIsSilenced(alert)) continue
            const sources = nonTempSourcesOn(alert, deviceUID, channelName)
            if (sources.some((source) => sourceIsActive(alert, source))) {
                return alert.name
            }
        }
        return undefined
    }

    /**
     * How many enabled alerts watch any of the given fans via a non-Temp
     * source. These are paused while each fan's own sweep runs.
     */
    const watchingAlertCount = (fans: Array<{ deviceUID: UID; channelName: string }>): number => {
        let count = 0
        for (const alert of settingsStore.alerts) {
            if (!alert.enabled) continue
            const watches = fans.some(
                (fan) => nonTempSourcesOn(alert, fan.deviceUID, fan.channelName).length > 0,
            )
            if (watches) count += 1
        }
        return count
    }

    return { blockingAlertName, watchingAlertCount }
}
