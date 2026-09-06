<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import { computed, provide, ref, watch } from 'vue'
import UiModal from '@/shell/ui/UiModal.vue'
import { closeDialog, type DynamicDialogInstance, type OpenDialog } from '@/shell/dialog'

// Renders one opened dialog, providing the `dialogRef` its component injects
// (mirrors PrimeVue's DynamicDialog contract: .data + .close()).
const props = defineProps<{ dialog: OpenDialog }>()

const isOpen = ref(true)
const chrome = computed<Record<string, any>>(() => props.dialog.options.props ?? {})

const close = (result?: any): void => {
    closeDialog(props.dialog.id, result)
}
// Closing via escape / overlay / the X sets isOpen false; route it to close().
watch(isOpen, (value) => {
    if (!value) close()
})

const dialogRef = ref<DynamicDialogInstance>({
    data: props.dialog.options.data,
    close,
})
provide('dialogRef', dialogRef)
</script>

<template>
    <UiModal
        v-model:open="isOpen"
        :title="chrome.header ?? ''"
        :closable="chrome.closable ?? true"
        :dismissable="chrome.dismissableMask ?? true"
        :close-on-escape="chrome.closeOnEscape ?? true"
        :modal="chrome.modal ?? true"
        :content-style="chrome.style"
    >
        <component :is="dialog.component" />
    </UiModal>
</template>
