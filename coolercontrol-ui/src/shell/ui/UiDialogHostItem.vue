<!--
  - CoolerControl - monitor and control your cooling and other devices
  - Copyright (c) 2021-2025  Guy Boldon and contributors
  -
  - This program is free software: you can redistribute it and/or modify
  - it under the terms of the GNU General Public License as published by
  - the Free Software Foundation, either version 3 of the License, or
  - (at your option) any later version.
  -
  - This program is distributed in the hope that it will be useful,
  - but WITHOUT ANY WARRANTY; without even the implied warranty of
  - MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  - GNU General Public License for more details.
  -
  - You should have received a copy of the GNU General Public License
  - along with this program.  If not, see <https://www.gnu.org/licenses/>.
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
        :modal="chrome.modal ?? true"
        :content-style="chrome.style"
    >
        <component :is="dialog.component" />
    </UiModal>
</template>
