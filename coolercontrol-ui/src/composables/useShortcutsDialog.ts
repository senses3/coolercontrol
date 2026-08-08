// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Keyboard-shortcuts dialog bridge (PrimeVue dialog service stays out of the
// shell). The module-level flag prevents stacking via the hotkey.

import { defineAsyncComponent } from 'vue'
import { useDialog } from '@/shell/dialog'
import { useI18n } from 'vue-i18n'

const shortcutsView = defineAsyncComponent(() => import('@/components/ShortcutsView.vue'))

let shortcutsDialogVisible = false

export function useShortcutsDialog() {
    const dialog = useDialog()
    const { t } = useI18n()
    const openShortcutsDialog = (): void => {
        if (shortcutsDialogVisible) return
        shortcutsDialogVisible = true
        dialog.open(shortcutsView, {
            props: {
                header: t('views.shortcuts.shortcuts'),
                position: 'center',
                modal: true,
                dismissableMask: true,
            },
            data: {},
            onClose: () => {
                shortcutsDialogVisible = false
            },
        })
    }
    return { openShortcutsDialog }
}
