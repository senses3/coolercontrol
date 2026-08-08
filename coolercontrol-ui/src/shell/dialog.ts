// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

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
