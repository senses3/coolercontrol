<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiCheck } from '@mdi/js'
import type { UiSelectOption } from '@/shell/ui/UiSelect.vue'

// Always-visible single-select option list (the dropdown variant is UiSelect).
const model = defineModel<string | undefined>()
withDefaults(defineProps<{ options: UiSelectOption[]; disabled?: boolean }>(), {
    disabled: false,
})
</script>

<template>
    <div
        class="flex flex-col gap-0.5 rounded-lg border border-border-one bg-control p-1 text-left"
        :class="{ 'pointer-events-none opacity-50': disabled }"
    >
        <button
            v-for="option in options"
            :key="option.value"
            type="button"
            :disabled="option.disabled"
            class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-base text-text-color outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50"
            :class="{ 'bg-surface-hover': model === option.value }"
            @click="model = option.value"
        >
            <svg-icon
                type="mdi"
                :path="mdiCheck"
                :size="14"
                class="shrink-0"
                :class="model === option.value ? 'text-accent' : 'invisible'"
            />
            <slot name="option" :option="option">{{ option.label }}</slot>
        </button>
    </div>
</template>
