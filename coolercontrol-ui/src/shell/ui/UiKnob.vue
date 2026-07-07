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
import { computed } from 'vue'

// Circular value dial: a 300 degree arc with the gap at the bottom.
// strokeWidth is in viewBox units (the drawing is a 100x100 viewBox).
const model = defineModel<number>({ required: true })
const props = withDefaults(
    defineProps<{
        min?: number
        max?: number
        step?: number
        size?: number
        strokeWidth?: number
        valueTemplate?: (value: number) => string
        disabled?: boolean
    }>(),
    {
        min: 0,
        max: 100,
        step: 1,
        size: 100,
        strokeWidth: 14,
        valueTemplate: (value: number) => `${value}`,
        disabled: false,
    },
)

const radius = 40
const mid = 50
const minRadians = (4 * Math.PI) / 3
const maxRadians = -Math.PI / 3

const mapRange = (
    value: number,
    inMin: number,
    inMax: number,
    outMin: number,
    outMax: number,
): number => ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin

const minX = mid + Math.cos(minRadians) * radius
const minY = mid - Math.sin(minRadians) * radius
const maxX = mid + Math.cos(maxRadians) * radius
const maxY = mid - Math.sin(maxRadians) * radius

const valueRadians = computed(() =>
    mapRange(model.value ?? props.min, props.min, props.max, minRadians, maxRadians),
)
const valueX = computed(() => mid + Math.cos(valueRadians.value) * radius)
const valueY = computed(() => mid - Math.sin(valueRadians.value) * radius)
const largeArc = computed(() => (Math.abs(valueRadians.value - minRadians) < Math.PI ? 0 : 1))

const rangePath = `M ${minX} ${minY} A ${radius} ${radius} 0 1 1 ${maxX} ${maxY}`
const valuePath = computed(
    () =>
        `M ${minX} ${minY} A ${radius} ${radius} 0 ${largeArc.value} 1 ${valueX.value} ${valueY.value}`,
)

const clamp = (value: number): number => Math.min(props.max, Math.max(props.min, value))
const setValue = (value: number): void => {
    model.value = clamp(Math.round(value / props.step) * props.step)
}

const updateFromPointer = (event: PointerEvent): void => {
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
    const dx = event.clientX - rect.left - rect.width / 2
    const dy = rect.height / 2 - (event.clientY - rect.top)
    const angle = Math.atan2(dy, dx)
    // The gap below the start angle belongs to neither end; ignore it like PrimeVue.
    const start = -Math.PI / 2 - Math.PI / 6
    if (angle > maxRadians) {
        setValue(mapRange(angle, minRadians, maxRadians, props.min, props.max))
    } else if (angle < start) {
        setValue(mapRange(angle + 2 * Math.PI, minRadians, maxRadians, props.min, props.max))
    }
}

const onPointerDown = (event: PointerEvent): void => {
    if (props.disabled || event.button !== 0) return
    ;(event.currentTarget as SVGElement).setPointerCapture(event.pointerId)
    updateFromPointer(event)
}
const onPointerMove = (event: PointerEvent): void => {
    if (props.disabled) return
    if ((event.buttons & 1) === 1) updateFromPointer(event)
}

const onKeydown = (event: KeyboardEvent): void => {
    if (props.disabled) return
    const current = model.value ?? props.min
    switch (event.key) {
        case 'ArrowUp':
        case 'ArrowRight':
            setValue(current + props.step)
            break
        case 'ArrowDown':
        case 'ArrowLeft':
            setValue(current - props.step)
            break
        case 'PageUp':
            setValue(current + props.step * 10)
            break
        case 'PageDown':
            setValue(current - props.step * 10)
            break
        case 'Home':
            setValue(props.min)
            break
        case 'End':
            setValue(props.max)
            break
        default:
            return
    }
    event.preventDefault()
}
</script>

<template>
    <div :class="{ 'pointer-events-none opacity-50': disabled }">
        <svg
            viewBox="0 0 100 100"
            role="slider"
            :tabindex="disabled ? -1 : 0"
            :aria-valuemin="min"
            :aria-valuemax="max"
            :aria-valuenow="model"
            :width="size"
            :height="size"
            class="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @keydown="onKeydown"
        >
            <path :d="rangePath" :stroke-width="strokeWidth" class="fill-none stroke-bg-two" />
            <path :d="valuePath" :stroke-width="strokeWidth" class="fill-none stroke-accent" />
            <text x="50" y="57" text-anchor="middle" class="select-none fill-text-color text-xl">
                {{ valueTemplate(model) }}
            </text>
        </svg>
    </div>
</template>
