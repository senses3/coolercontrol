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
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiCheck, mdiMagnify, mdiMemory, mdiMinusThick } from '@mdi/js'
import { computed, ref } from 'vue'

export interface UiGroupedOption {
    label: string
    value: string
    /** Sensor line color rendered as a dash before the label. */
    color?: string
    /** Right-aligned live value, e.g. '45.0 °C'. */
    rightText?: string
    disabled?: boolean
}

export interface UiOptionGroup {
    label: string
    options: UiGroupedOption[]
}

// Grouped single- or multi-select option list with optional filtering.
const model = defineModel<string | string[] | undefined>()
const props = withDefaults(
    defineProps<{
        groups: UiOptionGroup[]
        filter?: boolean
        filterPlaceholder?: string
        multiple?: boolean
        invalid?: boolean
        emptyText?: string
    }>(),
    { filter: false, filterPlaceholder: '', multiple: false, invalid: false, emptyText: '' },
)

const filterText = ref('')
const visibleGroups = computed(() => {
    const needle = filterText.value.trim().toLowerCase()
    if (!needle) return props.groups
    return props.groups
        .map((group) => ({
            ...group,
            options: group.options.filter((option) => option.label.toLowerCase().includes(needle)),
        }))
        .filter((group) => group.options.length > 0)
})

const isSelected = (value: string): boolean =>
    props.multiple ? ((model.value as string[]) ?? []).includes(value) : model.value === value

const toggle = (value: string): void => {
    if (props.multiple) {
        const current = [...(((model.value as string[]) ?? []) as string[])]
        const index = current.indexOf(value)
        if (index >= 0) {
            current.splice(index, 1)
        } else {
            current.push(value)
        }
        model.value = current
    } else {
        model.value = value
    }
}
</script>

<template>
    <div
        class="flex min-h-0 flex-col rounded-lg border bg-bg-one"
        :class="invalid ? 'border-error' : 'border-border-one'"
    >
        <div v-if="filter" class="flex items-center gap-2 border-b border-border-one px-3 py-2">
            <svg-icon
                type="mdi"
                :path="mdiMagnify"
                :size="16"
                class="shrink-0 text-text-color-secondary"
            />
            <input
                v-model="filterText"
                type="text"
                :placeholder="filterPlaceholder"
                class="w-full bg-transparent text-base text-text-color outline-none"
            />
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-1">
            <template v-for="group in visibleGroups" :key="group.label">
                <div
                    class="flex items-center gap-2 px-2 py-1.5 text-sm font-semibold text-text-color"
                >
                    <slot name="group" :group="group">
                        <svg-icon type="mdi" :path="mdiMemory" :size="18" class="shrink-0" />
                        {{ group.label }}
                    </slot>
                </div>
                <button
                    v-for="option in group.options"
                    :key="option.value"
                    type="button"
                    :disabled="option.disabled"
                    class="flex w-full items-center gap-2 rounded-md py-1.5 pl-6 pr-2 text-base text-text-color outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50"
                    :class="{ 'bg-surface-hover': isSelected(option.value) }"
                    @click="toggle(option.value)"
                >
                    <svg-icon
                        type="mdi"
                        :path="mdiCheck"
                        :size="14"
                        class="shrink-0"
                        :class="isSelected(option.value) ? 'text-accent' : 'invisible'"
                    />
                    <svg-icon
                        v-if="option.color"
                        type="mdi"
                        :path="mdiMinusThick"
                        :size="14"
                        class="shrink-0"
                        :style="{ color: option.color }"
                    />
                    <span class="truncate">{{ option.label }}</span>
                    <span
                        v-if="option.rightText"
                        class="ml-auto shrink-0 pl-2 text-text-color-secondary"
                    >
                        {{ option.rightText }}
                    </span>
                </button>
            </template>
            <div
                v-if="visibleGroups.length === 0"
                class="px-3 py-4 text-center text-sm text-text-color-secondary"
            >
                {{ emptyText }}
            </div>
        </div>
    </div>
</template>
