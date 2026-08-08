<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiFilter, mdiFilterOutline } from '@mdi/js'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed } from 'vue'
import UiGroupedListbox, { type UiOptionGroup } from '@/shell/ui/UiGroupedListbox.vue'

// Multi-select dropdown: a filter-style trigger opening a (grouped) checklist.
const model = defineModel<string[]>({ required: true })
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

const listModel = computed<string | string[] | undefined>({
    get: () => model.value,
    set: (value) => {
        if (Array.isArray(value)) model.value = value
    },
})

const summary = computed((): string => {
    if (model.value.length === 0) return props.placeholder
    const byValue = new Map(
        props.groups.flatMap((group) =>
            group.options.map((option) => [option.value, option.label]),
        ),
    )
    return model.value.map((value) => byValue.get(value) ?? value).join(', ')
})
</script>

<template>
    <PopoverRoot>
        <PopoverTrigger
            v-bind="$attrs"
            :disabled="disabled"
            class="inline-flex h-10 min-w-0 items-center justify-between gap-2 rounded-lg border bg-control px-3 text-base outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50"
            :class="[
                invalid ? 'border-error' : 'border-border-one',
                model.length > 0 ? 'text-text-color' : 'text-text-color-secondary',
            ]"
        >
            <span class="truncate">{{ summary }}</span>
            <svg-icon
                type="mdi"
                :path="model.length > 0 ? mdiFilter : mdiFilterOutline"
                :size="16"
                class="shrink-0"
            />
        </PopoverTrigger>
        <PopoverPortal>
            <PopoverContent side="bottom" align="start" :side-offset="2" class="z-[1300]">
                <UiGroupedListbox
                    v-model="listModel"
                    :groups="groups"
                    multiple
                    :filter="filter"
                    :filter-placeholder="filterPlaceholder"
                    class="max-h-96 w-72 overflow-hidden shadow-overlay-lg"
                />
            </PopoverContent>
        </PopoverPortal>
    </PopoverRoot>
</template>
