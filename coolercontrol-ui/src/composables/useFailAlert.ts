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

import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ChannelMetric } from '@/models/ChannelSource.ts'

// Above any real fan; matches the alert editor's RPM ceiling.
const FAIL_ALERT_RPM_MAX = 30000

// Opens the alert editor prefilled to fire when a fan drops to 0 rpm.
export function useFailAlert() {
    const { t } = useI18n()
    const router = useRouter()
    const createFailAlert = (deviceUID: string, channelName: string, label: string): void => {
        router.push({
            name: 'monitoring-alert-new',
            query: {
                device: deviceUID,
                channel: channelName,
                metric: ChannelMetric.RPM,
                min: '1',
                max: String(FAIL_ALERT_RPM_MAX),
                name: `${label} ${t('layout.shell.monitoringPanel.failAlertSuffix')}`,
            },
        })
    }
    return { createFailAlert }
}
