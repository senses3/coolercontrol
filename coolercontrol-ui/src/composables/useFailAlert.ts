// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

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
