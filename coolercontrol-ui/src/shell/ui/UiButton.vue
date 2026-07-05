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

type Variant = 'solid' | 'ghost' | 'outline'
type Size = 'md' | 'icon'

const props = withDefaults(
    defineProps<{
        variant?: Variant
        size?: Size
    }>(),
    { variant: 'solid', size: 'md' },
)

const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors ' +
    'outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer ' +
    'disabled:opacity-50 disabled:pointer-events-none'

const variants: Record<Variant, string> = {
    solid: 'bg-accent text-bg-one hover:bg-accent/80',
    ghost: 'text-text-color hover:bg-surface-hover',
    outline: 'border border-border-one text-text-color hover:bg-surface-hover',
}

const sizes: Record<Size, string> = {
    md: 'h-9 px-4 text-sm',
    icon: 'h-9 w-9 p-0',
}

const classes = computed(() => [base, variants[props.variant], sizes[props.size]].join(' '))
</script>

<template>
    <button :class="classes" type="button">
        <slot />
    </button>
</template>
