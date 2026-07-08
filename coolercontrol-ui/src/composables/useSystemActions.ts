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

// Daemon restart with confirm + toast, ported from the old top bar. Bridged
// here so the shell rail stays free of direct PrimeVue imports.

import { useConfirm } from 'primevue/useconfirm'
import { useToast } from '@/shell/toast'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'

export function useSystemActions() {
    const confirm = useConfirm()
    const toast = useToast()
    const { t } = useI18n()
    const deviceStore = useDeviceStore()

    const restartDaemonAndUI = (): void => {
        confirm.require({
            message: t('layout.topbar.restartConfirmMessage'),
            header: t('layout.topbar.restartConfirmHeader'),
            icon: 'pi pi-exclamation-triangle',
            defaultFocus: 'accept',
            accept: async () => {
                const successful = await deviceStore.daemonClient.shutdownDaemon()
                if (successful) {
                    toast.add({
                        severity: 'success',
                        summary: t('common.success'),
                        detail: t('layout.topbar.shutdownSuccess'),
                        life: 6000,
                    })
                    await deviceStore.waitAndReload()
                } else {
                    toast.add({
                        severity: 'error',
                        summary: t('common.error'),
                        detail: t('layout.topbar.shutdownError'),
                        life: 4000,
                    })
                }
            },
        })
    }

    return { restartDaemonAndUI }
}
