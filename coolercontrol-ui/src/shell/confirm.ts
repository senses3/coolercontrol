// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Kit confirm: a drop-in for PrimeVue's useConfirm() rendered by
// shell/ui/UiConfirmDialog.vue. Same `.require({...})` shape (message, header,
// icon, acceptLabel, rejectLabel, accept, reject, group, ...) so call sites only
// swap the import path. One confirmation is active at a time (per PrimeVue).
import { ref } from 'vue'

export interface ConfirmOptions {
    message?: string
    header?: string
    icon?: string
    acceptLabel?: string
    rejectLabel?: string
    acceptClass?: string
    group?: string
    defaultFocus?: string
    accept?: () => void
    reject?: () => void
}

const active = ref<ConfirmOptions | null>(null)

const require = (options: ConfirmOptions): void => {
    active.value = options
}
const close = (): void => {
    active.value = null
}

export const currentConfirm = active

export function useConfirm() {
    return { require, close }
}
