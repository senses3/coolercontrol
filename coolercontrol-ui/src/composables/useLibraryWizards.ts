// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Bridge for opening the profile and function creation wizards from new-shell
// code without a direct PrimeVue import there (dependency discipline).

import { defineAsyncComponent } from 'vue'
import { useDialog } from '@/shell/dialog'
import { useI18n } from 'vue-i18n'

const profileWizard = defineAsyncComponent(() => import('@/components/wizards/profile/Wizard.vue'))
const functionWizard = defineAsyncComponent(
    () => import('@/components/wizards/function/Wizard.vue'),
)

export function useLibraryWizards() {
    const dialog = useDialog()
    const { t } = useI18n()
    const openProfileWizard = (): void => {
        dialog.open(profileWizard, {
            props: {
                header: t('views.profiles.newProfile'),
                position: 'center',
                modal: true,
                dismissableMask: true,
            },
            data: {},
        })
    }
    const openFunctionWizard = (): void => {
        dialog.open(functionWizard, {
            props: {
                header: t('views.functions.newFunction'),
                position: 'center',
                modal: true,
                dismissableMask: true,
            },
            data: {},
        })
    }
    return { openProfileWizard, openFunctionWizard }
}
