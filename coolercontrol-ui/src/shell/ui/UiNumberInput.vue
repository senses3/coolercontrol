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
import { computed, onBeforeUnmount } from 'vue'

const model = defineModel<number>({ required: true })
const props = withDefaults(
    defineProps<{
        min?: number
        max?: number
        // Recommended band inside min/max. Values outside it still apply, they
        // just render in the warning color. Defaults to min/max, i.e. no band.
        safeMin?: number
        safeMax?: number
        step?: number
        prefix?: string
        suffix?: string
        disabled?: boolean
    }>(),
    {
        min: Number.MIN_SAFE_INTEGER,
        max: Number.MAX_SAFE_INTEGER,
        safeMin: undefined,
        safeMax: undefined,
        step: 1,
        prefix: '',
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

// Press-and-hold repeats the step: one step on press, then auto-repeat.
let holdDelay: ReturnType<typeof setTimeout> | undefined
let holdRepeat: ReturnType<typeof setInterval> | undefined
const stopHold = (): void => {
    clearTimeout(holdDelay)
    clearInterval(holdRepeat)
    window.removeEventListener('pointerup', stopHold)
}
const startHold = (direction: number): void => {
    stopHold()
    stepBy(direction)
    window.addEventListener('pointerup', stopHold)
    holdDelay = setTimeout(() => {
        holdRepeat = setInterval(() => stepBy(direction), 75)
    }, 400)
}
onBeforeUnmount(stopHold)

// Keyboard activation arrives as a click with detail 0; pointer presses are
// handled by startHold and must not double-step through click.
const keyboardStep = (event: MouseEvent, direction: number): void => {
    if (event.detail === 0) stepBy(direction)
}
const onInput = (event: Event): void => {
    const value = Number((event.target as HTMLInputElement).value)
    if (!Number.isNaN(value)) model.value = clamp(value)
}
// Fractional steps keep a fixed precision: 10.5 + 0.5 reads 11.0, not 11.
// A finer value typed by hand keeps its own precision.
const decimalsOf = (value: number | undefined): number => {
    const text = String(value ?? '')
    const dot = text.indexOf('.')
    return dot === -1 ? 0 : text.length - dot - 1
}
const displayValue = computed(() => {
    if (model.value == null) return ''
    const digits = Math.max(decimalsOf(props.step), decimalsOf(model.value))
    return digits > 0 ? model.value.toFixed(digits) : String(model.value)
})
// Size the input to its content so the suffix hugs the number.
const inputWidth = computed(() => `${Math.max(displayValue.value.length, 1) + 1}ch`)
const outsideSafeBand = computed(() => {
    if (model.value == null) return false
    if (props.safeMin != null && model.value < props.safeMin) return true
    return props.safeMax != null && model.value > props.safeMax
})
</script>

<template>
    <span
        class="inline-flex h-10 items-stretch overflow-hidden rounded-lg border bg-control"
        :class="[
            outsideSafeBand ? 'border-warning' : 'border-border-one',
            { 'pointer-events-none opacity-50': disabled },
        ]"
    >
        <button
            type="button"
            class="px-2 text-text-color-secondary outline-none hover:bg-surface-hover hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
            :disabled="disabled"
            @pointerdown.prevent="startHold(-1)"
            @pointerleave="stopHold"
            @click="keyboardStep($event, -1)"
        >
            <svg-icon type="mdi" :path="mdiMinus" :size="14" />
        </button>
        <span class="flex min-w-16 items-center justify-center px-1">
            <span v-if="prefix" class="pr-0.5 text-sm text-text-color-secondary">
                {{ prefix }}
            </span>
            <input
                type="number"
                :value="displayValue"
                :min="min"
                :max="max"
                :step="step"
                :disabled="disabled"
                class="bg-transparent text-right text-base outline-none focus-visible:ring-2 focus-visible:ring-accent"
                :class="outsideSafeBand ? 'text-warning' : 'text-text-color'"
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
            @pointerdown.prevent="startHold(1)"
            @pointerleave="stopHold"
            @click="keyboardStep($event, 1)"
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
