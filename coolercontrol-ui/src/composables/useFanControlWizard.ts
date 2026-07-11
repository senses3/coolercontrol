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
