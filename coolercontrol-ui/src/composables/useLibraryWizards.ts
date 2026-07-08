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
