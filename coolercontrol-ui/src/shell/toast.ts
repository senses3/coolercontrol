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

// Kit toast: a drop-in replacement for PrimeVue's useToast() rendered by
// shell/ui/UiToast.vue. Same `.add({ severity, summary, detail, life })` shape
// so call sites only swap the import path.
import { reactive } from 'vue'

export interface ToastMessage {
    severity?: string
    summary?: string
    detail?: string
    life?: number
    group?: string
}

export interface StoredToast extends ToastMessage {
    id: number
}

const DEFAULT_LIFE = 3000

const toasts = reactive<StoredToast[]>([])
let nextId = 0

const remove = (id: number): void => {
    const index = toasts.findIndex((toast) => toast.id === id)
    if (index >= 0) toasts.splice(index, 1)
}

const add = (message: ToastMessage): void => {
    const id = nextId++
    toasts.push({ ...message, id })
    const life = message.life ?? DEFAULT_LIFE
    if (life > 0) setTimeout(() => remove(id), life)
}

const removeGroup = (group: string): void => {
    for (let i = toasts.length - 1; i >= 0; i--) {
        if (toasts[i].group === group) toasts.splice(i, 1)
    }
}

const removeAllGroups = (): void => {
    toasts.length = 0
}

export const activeToasts = toasts

export function useToast() {
    return { add, remove, removeGroup, removeAllGroups }
}
