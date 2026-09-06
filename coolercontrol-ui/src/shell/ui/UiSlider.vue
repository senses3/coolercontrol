<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'reka-ui'
import { computed } from 'vue'

const model = defineModel<number>({ required: true })
const props = withDefaults(
    defineProps<{
        min?: number
        max?: number
        step?: number
        disabled?: boolean
    }>(),
    { min: 0, max: 100, step: 1, disabled: false },
)

const arrayModel = computed<number[]>({
    get: () => [model.value],
    set: (value) => {
        model.value = value?.[0] ?? props.min
    },
})
</script>

<template>
    <SliderRoot
        v-model="arrayModel"
        :min="min"
        :max="max"
        :step="step"
        :disabled="disabled"
        class="relative flex h-5 w-full touch-none select-none items-center data-[disabled]:opacity-50"
    >
        <SliderTrack class="relative h-1.5 grow overflow-hidden rounded-full bg-surface-hover">
            <SliderRange class="absolute h-full rounded-full bg-accent" />
        </SliderTrack>
        <SliderThumb
            class="block h-4 w-4 cursor-pointer rounded-full bg-accent outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-accent"
        />
    </SliderRoot>
</template>
