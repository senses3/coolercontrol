// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Bridge for opening the calibration and generate (auto-create profiles)
// wizards from new-shell code without a direct PrimeVue import there. These
// replace the dangling 'calibrate-fans' / 'profile-generate' emitter events
// whose listeners died with the old shell.

import { defineAsyncComponent } from 'vue'
import { useDialog } from '@/shell/dialog'
import { useI18n } from 'vue-i18n'
import type { UID } from '@/models/Device.ts'

const calibrationWizard = defineAsyncComponent(
    () => import('@/components/wizards/calibration/CalibrationWizard.vue'),
)
const generateWizard = defineAsyncComponent(
    () => import('@/components/wizards/generate/GenerateWizard.vue'),
)
const modeWizard = defineAsyncComponent(() => import('@/components/wizards/mode/Wizard.vue'))
const profileApplyWizard = defineAsyncComponent(
    () => import('@/components/wizards/profile-apply/Wizard.vue'),
)
const functionApplyWizard = defineAsyncComponent(
    () => import('@/components/wizards/function-apply/Wizard.vue'),
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
    // A single-channel preselect scopes the wizard to just that fan; omitted =
    // all controllable fans (whole-system).
    const openGenerateWizard = (preselect?: CalibrationPreselect): void => {
        dialog.open(generateWizard, {
            props: {
                header: t('components.wizards.generate.title'),
                position: 'center',
                modal: true,
                dismissableMask: true,
            },
            data: { preselect },
        })
    }
    const openModeWizard = (): void => {
        dialog.open(modeWizard, {
            props: {
                header: t('views.modes.createMode'),
                position: 'center',
                modal: true,
                dismissableMask: true,
            },
            data: {},
        })
    }
    const openProfileApplyWizard = (profileUID: UID): void => {
        dialog.open(profileApplyWizard, {
            props: {
                header: t('components.wizards.profileApply.applyProfile'),
                position: 'center',
                modal: true,
                dismissableMask: true,
            },
            data: { profileUID },
        })
    }
    const openFunctionApplyWizard = (functionUID: UID): void => {
        dialog.open(functionApplyWizard, {
            props: {
                header: t('components.wizards.functionApply.applyFunction'),
                position: 'center',
                modal: true,
                dismissableMask: true,
            },
            data: { functionUID },
        })
    }
    return {
        openCalibrationWizard,
        openGenerateWizard,
        openModeWizard,
        openProfileApplyWizard,
        openFunctionApplyWizard,
    }
}
