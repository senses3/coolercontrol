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

// Plugin start/stop/restart with toasts, shared by the plugin page and the
// plugins panel (PrimeVue toast service stays out of the shell).

import { useToast } from 'primevue/usetoast'
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
