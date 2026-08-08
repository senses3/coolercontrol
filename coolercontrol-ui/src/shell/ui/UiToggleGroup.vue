<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import { ToggleGroupItem, ToggleGroupRoot } from 'reka-ui'
import { computed } from 'vue'

export interface UiToggleOption {
    label: string
    value: string
    disabled?: boolean
}

const model = defineModel<string>({ required: true })
defineProps<{ options: UiToggleOption[] }>()

// Single-select that cannot be toggled off to an empty state.
const groupModel = computed<string>({
    get: () => model.value,
    set: (value) => {
        if (value != null && value !== '') model.value = value
    },
})
</script>

<template>
    <ToggleGroupRoot
        v-model="groupModel"
        type="single"
        class="inline-flex h-10 items-center rounded-lg border border-border-one bg-control p-0.5"
    >
        <ToggleGroupItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            :disabled="option.disabled"
            class="cursor-pointer whitespace-nowrap rounded-md px-3 py-1 text-base text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent data-[state=on]:bg-accent data-[state=on]:text-bg-one data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
        >
            {{ option.label }}
        </ToggleGroupItem>
    </ToggleGroupRoot>
</template>
