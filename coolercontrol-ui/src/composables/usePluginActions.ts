// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Plugin start/stop/restart with toasts, shared by the plugin page and the
// plugins panel (PrimeVue toast service stays out of the shell).

import { useToast } from '@/shell/toast'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'

export function usePluginActions() {
    const toast = useToast()
    const { t } = useI18n()
    const deviceStore = useDeviceStore()

    const runAction = async (
        action: (pluginId: string) => Promise<boolean>,
        pluginId: string,
        successKey: string,
        failureKey: string,
    ): Promise<void> => {
        const success = await action(pluginId)
        if (success) {
            toast.add({
                severity: 'success',
                summary: t('common.success'),
                detail: t(successKey),
                life: 3000,
            })
        } else {
            toast.add({
                severity: 'error',
                summary: t('common.error'),
                detail: t(failureKey),
                life: 3000,
            })
        }
    }

    const startPlugin = (pluginId: string): Promise<void> =>
        runAction(
            (id) => deviceStore.daemonClient.startPlugin(id),
            pluginId,
            'layout.plugins.started',
            'layout.plugins.startFailed',
        )
    const stopPlugin = (pluginId: string): Promise<void> =>
        runAction(
            (id) => deviceStore.daemonClient.stopPlugin(id),
            pluginId,
            'layout.plugins.stopped',
            'layout.plugins.stopFailed',
        )
    const restartPlugin = (pluginId: string): Promise<void> =>
        runAction(
            (id) => deviceStore.daemonClient.restartPlugin(id),
            pluginId,
            'layout.plugins.restarted',
            'layout.plugins.restartFailed',
        )

    return { startPlugin, stopPlugin, restartPlugin }
}
