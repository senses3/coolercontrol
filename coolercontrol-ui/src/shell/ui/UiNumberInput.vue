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
import { mdiMinus, mdiPlus } from '@mdi/js'
import { computed } from 'vue'

const model = defineModel<number>({ required: true })
const props = withDefaults(
    defineProps<{
        min?: number
        max?: number
        step?: number
        suffix?: string
        disabled?: boolean
    }>(),
    {
        min: Number.MIN_SAFE_INTEGER,
        max: Number.MAX_SAFE_INTEGER,
        step: 1,
        suffix: '',
        disabled: false,
    },
)

const clamp = (value: number): number => Math.min(props.max, Math.max(props.min, value))
// Strip binary float noise (0.1 + 0.2 style) from step arithmetic.
const round = (value: number): number => Number.parseFloat(value.toFixed(10))
const stepBy = (direction: number): void => {
    model.value = round(clamp((model.value ?? 0) + direction * props.step))
}
const onInput = (event: Event): void => {
    const value = Number((event.target as HTMLInputElement).value)
    if (!Number.isNaN(value)) model.value = clamp(value)
}
// Size the input to its content so the suffix hugs the number.
const inputWidth = computed(() => `${Math.max(String(model.value ?? '').length, 1) + 1}ch`)
</script>

<template>
    <span
        class="inline-flex h-10 items-stretch overflow-hidden rounded-lg border border-border-one bg-bg-one"
        :class="{ 'pointer-events-none opacity-50': disabled }"
    >
        <button
            type="button"
            class="px-2 text-text-color-secondary outline-none hover:bg-surface-hover hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
            :disabled="disabled"
            @click="stepBy(-1)"
        >
            <svg-icon type="mdi" :path="mdiMinus" :size="14" />
        </button>
        <span class="flex min-w-16 items-center justify-center px-1">
            <input
                type="number"
                :value="model"
                :min="min"
                :max="max"
                :step="step"
                :disabled="disabled"
                class="bg-transparent text-right text-base text-text-color outline-none focus-visible:ring-2 focus-visible:ring-accent"
                :style="{ width: inputWidth }"
                @change="onInput"
            />
            <span v-if="suffix" class="pl-0.5 text-sm text-text-color-secondary">
                {{ suffix }}
            </span>
        </span>
        <button
            type="button"
            class="px-2 text-text-color-secondary outline-none hover:bg-surface-hover hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
            :disabled="disabled"
            @click="stepBy(1)"
        >
            <svg-icon type="mdi" :path="mdiPlus" :size="14" />
        </button>
    </span>
</template>

<style scoped>
input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
}
input[type='number'] {
    -moz-appearance: textfield;
    appearance: textfield;
}
</style>
