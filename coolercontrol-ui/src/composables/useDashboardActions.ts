// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Dashboard creation, shared by the Monitoring panel's add button and the
// search palette so the two cannot drift.

import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Dashboard } from '@/models/Dashboard.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'

export function useDashboardActions() {
    const { t } = useI18n()
    const router = useRouter()
    const settingsStore = useSettingsStore()

    const addDashboard = (): void => {
        const dashboard = new Dashboard(t('layout.shell.monitoringPanel.newDashboard'))
        settingsStore.dashboards.push(dashboard)
        router.push({ name: 'monitoring-dashboard', params: { dashboardUID: dashboard.uid } })
    }

    return { addDashboard }
}
