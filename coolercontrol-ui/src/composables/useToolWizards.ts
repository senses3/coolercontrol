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

// Bridge for opening the calibration and generate (auto-create profiles)
// wizards from new-shell code without a direct PrimeVue import there. These
// replace the dangling 'calibrate-fans' / 'profile-generate' emitter events
// whose listeners died with the old shell.

import { defineAsyncComponent } from 'vue'
import { useDialog } from 'primevue/usedialog'
import { useI18n } from 'vue-i18n'
import type { UID } from '@/models/Device.ts'

const calibrationWizard = defineAsyncComponent(
    () => import('@/components/wizards/calibration/CalibrationWizard.vue'),
)
const generateWizard = defineAsyncComponent(
    () => import('@/components/wizards/generate/GenerateWizard.vue'),
)

export interface CalibrationPreselect {
    deviceUID: UID
    channelName: string
}

export function useToolWizards() {
    const dialog = useDialog()
    const { t } = useI18n()
    const openCalibrationWizard = (preselect?: CalibrationPreselect[]): void => {
        dialog.open(calibrationWizard, {
            props: {
                header: t('components.wizards.calibration.title'),
                position: 'center',
                modal: true,
                dismissableMask: true,
            },
            data: { preselect },
        })
    }
    const openGenerateWizard = (): void => {
        dialog.open(generateWizard, {
            props: {
                header: t('components.wizards.generate.title'),
                position: 'center',
                modal: true,
                dismissableMask: true,
            },
            data: {},
        })
    }
    return { openCalibrationWizard, openGenerateWizard }
}
