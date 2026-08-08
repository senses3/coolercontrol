// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Bridge for opening the fan-control wizard from new-shell code without a
// direct PrimeVue import there (dependency discipline).

import { defineAsyncComponent } from 'vue'
import { useDialog } from '@/shell/dialog'
import { useI18n } from 'vue-i18n'
import type { UID } from '@/models/Device.ts'

const fanControlWizard = defineAsyncComponent(
    () => import('@/components/wizards/fan-control/Wizard.vue'),
)

export interface FanControlWizardData {
    deviceUID: UID
    channelName: string
    // '0' = unmanaged, undefined = manual, else the assigned profile uid.
    selectedProfileUID?: UID
    // Opens the wizard directly at this step (e.g. 3 = New Profile), skipping
    // the initial action menu. Read by Wizard.vue's currentStep init.
    initialStep?: number
}

export function useFanControlWizard() {
    const dialog = useDialog()
    const { t } = useI18n()
    const open = (data: FanControlWizardData): void => {
        dialog.open(fanControlWizard, {
            props: {
                header: t('components.wizards.fanControl.fanControlWizard'),
                position: 'center',
                modal: true,
                dismissableMask: true,
            },
            data,
        })
    }
    return { open }
}
