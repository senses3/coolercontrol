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
