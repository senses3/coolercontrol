<!--
  SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiPencilOutline } from '@mdi/js'
import { type Ref, ref, computed } from 'vue'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
    currentName: string
    saveNameFunction: (newName: string) => Promise<boolean>
    /**
     * The name that applies when the field is cleared, shown as its
     * placeholder. Defaults to the current name for entities that keep it.
     */
    fallbackName?: string
}>()

const deviceStore = useDeviceStore()
const { t } = useI18n()

const isEditingName = ref(false)
const nameInput: Ref<string> = ref('')
const nameInputRef = ref<HTMLInputElement>()
const isCancelling = ref(false)

const placeholderName = computed(() => props.fallbackName ?? props.currentName)
const inputWidth = computed(() => {
    // The placeholder needs the same room, or clearing the field truncates it.
    const length = Math.max(nameInput.value.length, placeholderName.value.length, 1)
    return `${length + 1}ch`
})

const startEditingName = (): void => {
    nameInput.value = props.currentName
    isEditingName.value = true
    setTimeout(() => nameInputRef.value?.focus())
}
const saveNameInline = async (): Promise<void> => {
    const sanitized = deviceStore.sanitizeString(nameInput.value)
    // emitting to the menu that the name has been updated can also occur in the caller's saveFunction.
    // It will also need to update the base model's name without an entity refresh.
    const success = await props.saveNameFunction(sanitized)
    if (!success) {
        nameInput.value = props.currentName
    }
    isEditingName.value = false
}
const cancelEditName = (event: KeyboardEvent): void => {
    event.preventDefault()
    isCancelling.value = true
    nameInputRef.value?.blur()
    isEditingName.value = false
}
const handleBlur = (): void => {
    if (isCancelling.value) {
        isCancelling.value = false
        return
    }
    if (!isEditingName.value) return // otherwise onBlur will save a second time
    saveNameInline()
}
</script>

<template>
    <div class="flex pl-4 py-2 text-2xl overflow-hidden items-center">
        <input
            v-if="isEditingName"
            ref="nameInputRef"
            id="alert-name-input"
            v-model="nameInput"
            type="text"
            :placeholder="placeholderName"
            class="mt-[1px] bg-transparent font-bold text-text-color-secondary outline-none placeholder:font-normal placeholder:opacity-60"
            :style="{ width: inputWidth }"
            @keydown.enter="saveNameInline"
            @keydown.esc="cancelEditName"
            @blur="handleBlur"
        />
        <button
            v-else
            type="button"
            class="flex min-w-0 items-center gap-2 rounded-lg text-left outline-none hover:text-text-color-secondary focus-visible:ring-2 focus-visible:ring-accent"
            :aria-label="t('layout.menu.tooltips.rename')"
            @click="startEditingName"
            v-tooltip.bottom="t('layout.menu.tooltips.rename')"
        >
            <span class="overflow-hidden overflow-ellipsis font-bold">
                {{ props.currentName }}
            </span>
            <!-- Dimmed so the name stays the emphasis. Opacity is constant:
                 the icon takes currentColor, so hover recolors it with the name. -->
            <svg-icon type="mdi" :path="mdiPencilOutline" :size="18" class="shrink-0 opacity-40" />
        </button>
    </div>
</template>

<style scoped lang="scss"></style>
