<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiClose, mdiUnfoldMoreHorizontal } from '@mdi/js'
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
        clearable?: boolean
    }>(),
    {
        placeholder: '',
        filter: false,
        filterPlaceholder: '',
        invalid: false,
        disabled: false,
        clearable: false,
    },
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
            class="inline-flex h-10 min-w-0 items-center justify-between gap-2 rounded-lg border bg-control px-3 text-base outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50"
            :class="invalid ? 'border-error' : 'border-border-one'"
        >
            <span v-if="selectedLabel" class="truncate text-text-color">{{ selectedLabel }}</span>
            <span v-else class="truncate text-text-color-secondary">{{ placeholder }}</span>
            <span class="flex shrink-0 items-center gap-1">
                <span
                    v-if="clearable && model != null && model !== ''"
                    role="button"
                    aria-label="clear"
                    class="cursor-pointer rounded text-text-color-secondary hover:text-text-color"
                    @pointerdown.stop.prevent="model = undefined"
                >
                    <svg-icon type="mdi" :path="mdiClose" :size="14" />
                </span>
                <svg-icon type="mdi" :path="mdiUnfoldMoreHorizontal" :size="16" />
            </span>
        </PopoverTrigger>
        <PopoverPortal>
            <PopoverContent side="bottom" align="start" :side-offset="2" class="z-[1300]">
                <UiGroupedListbox
                    v-model="listModel"
                    :groups="groups"
                    :filter="filter"
                    :filter-placeholder="filterPlaceholder"
                    class="max-h-96 w-72 overflow-hidden shadow-overlay-lg"
                />
            </PopoverContent>
        </PopoverPortal>
    </PopoverRoot>
</template>
