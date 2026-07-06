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
        class="inline-flex rounded-lg border border-border-one bg-bg-two p-0.5"
    >
        <ToggleGroupItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            :disabled="option.disabled"
            class="cursor-pointer rounded-md px-3 py-1.5 text-base text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent data-[state=on]:bg-accent data-[state=on]:text-bg-one data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
        >
            {{ option.label }}
        </ToggleGroupItem>
    </ToggleGroupRoot>
</template>
