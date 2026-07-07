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
import { mdiUnfoldMoreHorizontal } from '@mdi/js'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, ref } from 'vue'
import UiGroupedListbox, { type UiOptionGroup } from '@/shell/ui/UiGroupedListbox.vue'

// Single-select dropdown over a grouped option list; closes on selection.
const model = defineModel<string | undefined>()
const props = withDefaults(
    defineProps<{
        groups: UiOptionGroup[]
        placeholder?: string
        filter?: boolean
        filterPlaceholder?: string
        invalid?: boolean
        disabled?: boolean
    }>(),
    { placeholder: '', filter: false, filterPlaceholder: '', invalid: false, disabled: false },
)

defineOptions({ inheritAttrs: false })

const open = ref(false)
const listModel = computed<string | string[] | undefined>({
    get: () => model.value,
    set: (value) => {
        if (typeof value === 'string') {
            model.value = value
            open.value = false
        }
    },
})

const selectedLabel = computed((): string | undefined => {
    for (const group of props.groups) {
        const option = group.options.find((option) => option.value === model.value)
        if (option != null) return option.label
    }
    return undefined
})
</script>

<template>
    <PopoverRoot v-model:open="open">
        <PopoverTrigger
            v-bind="$attrs"
            :disabled="disabled"
            class="inline-flex h-10 min-w-0 items-center justify-between gap-2 rounded-lg border bg-bg-two px-3 text-base outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50"
            :class="invalid ? 'border-error' : 'border-border-one'"
        >
            <span v-if="selectedLabel" class="truncate text-text-color">{{ selectedLabel }}</span>
            <span v-else class="truncate text-text-color-secondary">{{ placeholder }}</span>
            <svg-icon type="mdi" :path="mdiUnfoldMoreHorizontal" :size="16" class="shrink-0" />
        </PopoverTrigger>
        <PopoverPortal>
            <PopoverContent side="bottom" align="start" :side-offset="4" class="z-50">
                <UiGroupedListbox
                    v-model="listModel"
                    :groups="groups"
                    :filter="filter"
                    :filter-placeholder="filterPlaceholder"
                    class="max-h-96 w-72 overflow-hidden shadow-md"
                />
            </PopoverContent>
        </PopoverPortal>
    </PopoverRoot>
</template>
