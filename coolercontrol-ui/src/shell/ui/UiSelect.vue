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
import { mdiCheck, mdiUnfoldMoreHorizontal } from '@mdi/js'
import { computed } from 'vue'
import {
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectItemText,
    SelectPortal,
    SelectRoot,
    SelectTrigger,
    SelectValue,
    SelectViewport,
} from 'reka-ui'

export interface UiSelectOption {
    label: string
    value: string
    disabled?: boolean
}

const model = defineModel<string | undefined>()
const props = withDefaults(
    defineProps<{
        options: UiSelectOption[]
        placeholder?: string
        disabled?: boolean
        invalid?: boolean
    }>(),
    { placeholder: '', disabled: false, invalid: false },
)

// Render the selected label directly instead of relying on SelectValue
// mirroring the selected item: items re-mount into the portal on open, which
// briefly empties the mirrored value and collapses the trigger width.
const selectedLabel = computed(
    () => props.options.find((option) => option.value === model.value)?.label,
)

defineOptions({ inheritAttrs: false })
</script>

<template>
    <SelectRoot v-model="model" :disabled="disabled">
        <SelectTrigger
            v-bind="$attrs"
            class="inline-flex h-10 min-w-40 items-center justify-between gap-2 rounded-lg border bg-bg-two px-3 text-base text-text-color outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
            :class="invalid ? 'border-error' : 'border-border-one'"
        >
            <SelectValue class="truncate">
                <span v-if="selectedLabel">{{ selectedLabel }}</span>
                <span v-else class="text-text-color-secondary">{{ placeholder }}</span>
            </SelectValue>
            <svg-icon type="mdi" :path="mdiUnfoldMoreHorizontal" :size="16" />
        </SelectTrigger>
        <SelectPortal>
            <SelectContent
                position="popper"
                :side-offset="4"
                class="z-[1300] max-h-80 min-w-40 overflow-hidden rounded-lg border border-border-one bg-bg-two shadow-md"
            >
                <SelectViewport class="p-1">
                    <SelectItem
                        v-for="option in options"
                        :key="option.value"
                        :value="option.value"
                        :disabled="option.disabled"
                        class="flex cursor-pointer select-none items-center justify-between gap-2 rounded-md px-2 py-1.5 text-base text-text-color outline-none data-[highlighted]:bg-surface-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                    >
                        <SelectItemText>
                            <slot name="option" :option="option">{{ option.label }}</slot>
                        </SelectItemText>
                        <SelectItemIndicator>
                            <svg-icon type="mdi" :path="mdiCheck" :size="14" />
                        </SelectItemIndicator>
                    </SelectItem>
                </SelectViewport>
            </SelectContent>
        </SelectPortal>
    </SelectRoot>
</template>
