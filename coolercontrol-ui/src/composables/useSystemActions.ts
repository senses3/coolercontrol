// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Daemon restart with confirm + toast, ported from the old top bar. Bridged
// here so the shell rail stays free of direct PrimeVue imports.

import { useConfirm } from '@/shell/confirm'
import { useToast } from '@/shell/toast'
import { useI18n } from 'vue-i18n'
import { mdiAlertOutline } from '@mdi/js'
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
            icon: mdiAlertOutline,
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
