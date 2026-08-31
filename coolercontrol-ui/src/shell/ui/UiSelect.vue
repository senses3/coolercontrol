<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiCheck, mdiClose, mdiUnfoldMoreHorizontal } from '@mdi/js'
import { computed, ref } from 'vue'
import {
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectItemIndicator,
    SelectItemText,
    SelectLabel,
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
    /** Options sharing a group are listed together under its heading. */
    group?: string
}

const model = defineModel<string | undefined>()
const props = withDefaults(
    defineProps<{
        options: UiSelectOption[]
        placeholder?: string
        disabled?: boolean
        invalid?: boolean
        clearable?: boolean
    }>(),
    { placeholder: '', disabled: false, invalid: false, clearable: false },
)

// Render the selected label directly instead of relying on SelectValue
// mirroring the selected item: items re-mount into the portal on open, which
// briefly empties the mirrored value and collapses the trigger width.
const selectedOption = computed(() => props.options.find((option) => option.value === model.value))
const selectedLabel = computed(() => selectedOption.value?.label)

// Options keep their given order; a group heading is emitted the first time a
// group is seen. Ungrouped options render exactly as before, with no heading.
const optionGroups = computed(() => {
    const groups: Array<{ label?: string; options: UiSelectOption[] }> = []
    for (const option of props.options) {
        const last = groups.at(-1)
        if (last != null && last.label === option.group) {
            last.options.push(option)
        } else {
            groups.push({ label: option.group, options: [option] })
        }
    }
    return groups
})

// Closing returns focus to the trigger programmatically, and the browser
// carries the content's focus-visible state over with it, so the ring appears
// after a mouse pick. Suppress it for exactly that case: a pointer-driven
// close. Any later keyboard use restores it.
const suppressRing = ref(false)
let pointerInteraction = false

const notePointer = (): void => {
    pointerInteraction = true
}
const noteKeyboard = (): void => {
    pointerInteraction = false
    suppressRing.value = false
}
const onCloseAutoFocus = (): void => {
    suppressRing.value = pointerInteraction
    pointerInteraction = false
}
const clearSuppression = (): void => {
    suppressRing.value = false
}

defineOptions({ inheritAttrs: false })
</script>

<template>
    <SelectRoot v-model="model" :disabled="disabled">
        <SelectTrigger
            v-bind="$attrs"
            class="inline-flex h-10 min-w-40 items-center justify-between gap-2 rounded-lg border bg-control px-3 text-base text-text-color outline-none hover:bg-surface-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
            :class="[
                invalid ? 'border-error' : 'border-border-one',
                suppressRing ? '' : 'focus-visible:ring-2 focus-visible:ring-accent',
            ]"
            @pointerdown="notePointer"
            @keydown="noteKeyboard"
            @focusout="clearSuppression"
        >
            <SelectValue class="truncate">
                <slot v-if="selectedOption" name="value" :option="selectedOption">
                    {{ selectedLabel }}
                </slot>
                <span v-else class="text-text-color-secondary">{{ placeholder }}</span>
            </SelectValue>
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
        </SelectTrigger>
        <SelectPortal>
            <SelectContent
                position="popper"
                :side-offset="2"
                @pointerdown="notePointer"
                @keydown="noteKeyboard"
                @close-auto-focus="onCloseAutoFocus"
                class="z-[1300] max-h-80 min-w-40 overflow-hidden rounded-lg border border-border-one bg-bg-two shadow-overlay-lg"
            >
                <SelectViewport class="p-1">
                    <SelectGroup
                        v-for="(group, groupIndex) in optionGroups"
                        :key="group.label ?? groupIndex"
                    >
                        <SelectLabel
                            v-if="group.label"
                            class="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-text-color-secondary"
                        >
                            {{ group.label }}
                        </SelectLabel>
                        <SelectItem
                            v-for="option in group.options"
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
                    </SelectGroup>
                </SelectViewport>
            </SelectContent>
        </SelectPortal>
    </SelectRoot>
</template>
