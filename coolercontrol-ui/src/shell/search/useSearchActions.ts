// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Dispatch for the palette's action entries. Every branch delegates to the
// composable or the ref that already owns the behaviour, so an action performed
// from search is the same code path as the button it mirrors, gates and all.

import { inject } from 'vue'
import { useRouter } from 'vue-router'
import type { Emitter, EventType } from 'mitt'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useToolWizards } from '@/composables/useToolWizards.ts'
import { useLibraryWizards } from '@/composables/useLibraryWizards.ts'
import { useSystemActions } from '@/composables/useSystemActions.ts'
import { useDashboardActions } from '@/composables/useDashboardActions.ts'
import { useShortcutsDialog } from '@/composables/useShortcutsDialog.ts'
import { detectionOpen, hardwareReportOpen } from '@/shell/hardware/hardwareModals.ts'
import type { ActionId } from '@/shell/search/actionCatalog.ts'

export function useSearchActions() {
    // Provided in main.ts; App.vue listens for 'start-tour' on it.
    const emitter: Emitter<Record<EventType, any>> = inject('emitter')!
    const router = useRouter()
    const deviceStore = useDeviceStore()
    const { openCalibrationWizard, openGenerateWizard, openModeWizard } = useToolWizards()
    const { openProfileWizard, openFunctionWizard } = useLibraryWizards()
    const { restartDaemonAndUI } = useSystemActions()
    const { addDashboard } = useDashboardActions()
    const { openShortcutsDialog } = useShortcutsDialog()

    const runAction = (id: ActionId): void => {
        switch (id) {
            case 'new-profile':
                return openProfileWizard()
            case 'new-function':
                return openFunctionWizard()
            case 'new-mode':
                return openModeWizard()
            case 'new-alert':
                void router.push({ name: 'monitoring-alert-new' })
                return
            case 'new-dashboard':
                return addDashboard()
            case 'new-custom-sensor':
                void router.push({ name: 'device-custom-sensor-new' })
                return
            case 'generate-profiles':
                return openGenerateWizard()
            case 'calibrate-fans':
                return openCalibrationWizard()
            case 'hardware-detection':
                detectionOpen.value = true
                return
            case 'hardware-report':
                hardwareReportOpen.value = true
                return
            case 'start-tour':
                emitter.emit('start-tour')
                return
            case 'shortcuts':
                return openShortcutsDialog()
            case 'restart-ui':
                return deviceStore.reloadUI()
            case 'restart-daemon':
                return restartDaemonAndUI()
            case 'open-in-browser':
                window.open(deviceStore.daemonClient.daemonURL, '_blank')
                return
        }
    }

    return { runAction }
}
