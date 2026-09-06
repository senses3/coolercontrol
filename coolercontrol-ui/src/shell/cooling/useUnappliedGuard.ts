// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Ref } from 'vue'
import { mdiAlertOutline } from '@mdi/js'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useConfirm } from '@/shell/confirm'

/**
 * Asks before leaving a channel page whose changes were never applied.
 *
 * A control mode, a duty and a curve are all chosen on the page and only reach
 * the daemon on apply, and nothing on the page says so: the fan carries on
 * doing what it did before while the page reads as though it does not. Leaving
 * would discard that silently.
 *
 * The embedded profile editor leaves its own prompt to this one (see the
 * editor's `hideSave`), so a curve edit and a control mode change are asked
 * about together, once.
 */
export function useUnappliedGuard(isDirty: Ref<boolean>): void {
    const { t } = useI18n()
    const confirm = useConfirm()

    const confirmLeaving = (): boolean | Promise<boolean> => {
        if (!isDirty.value) return true
        return new Promise<boolean>((resolve) => {
            confirm.require({
                message: t('layout.shell.coolingPage.unsavedChanges'),
                header: t('layout.shell.coolingPage.unsavedChangesHeader'),
                icon: mdiAlertOutline,
                defaultFocus: 'accept',
                rejectLabel: t('common.stay'),
                acceptLabel: t('common.discard'),
                accept: () => resolve(true),
                reject: () => resolve(false),
            })
        })
    }
    onBeforeRouteUpdate(confirmLeaving)
    onBeforeRouteLeave(confirmLeaving)
}
