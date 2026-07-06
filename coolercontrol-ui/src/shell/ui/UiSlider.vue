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
