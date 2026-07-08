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

// Kit dynamic-dialog host: a drop-in for PrimeVue's useDialog()/DynamicDialog,
// rendered by shell/ui/UiDynamicDialog.vue. `open(component, { props, data })`
// pushes a dialog; the opened component injects `dialogRef` (a ref exposing
// `.data` and `.close()`), matching the old contract so call sites and wizards
// only swap the import path.
import { markRaw, reactive, type Component } from 'vue'

// Minimal shape the wizards use from the injected dialogRef.value.
export interface DynamicDialogInstance {
    data?: any
    close: (result?: any) => void
}

export interface DialogOpenOptions {
    // Dialog chrome (header title, dismissable mask, etc.) + optional style/width.
    props?: Record<string, any>
    data?: any
    onClose?: (options: { data?: any }) => void
}

export interface OpenDialog {
    id: number
    component: Component
    options: DialogOpenOptions
}

const dialogs = reactive<OpenDialog[]>([])
let nextId = 0

const closeById = (id: number, result?: any): void => {
    const index = dialogs.findIndex((dialog) => dialog.id === id)
    if (index < 0) return
    const [removed] = dialogs.splice(index, 1)
    removed.options.onClose?.({ data: result })
}

const open = (component: Component, options: DialogOpenOptions = {}): DynamicDialogInstance => {
    const id = nextId++
    dialogs.push({ id, component: markRaw(component), options })
    return { data: options.data, close: (result?: any) => closeById(id, result) }
}

export const openDialogs = dialogs
export const closeDialog = closeById

export function useDialog() {
    return { open }
}
