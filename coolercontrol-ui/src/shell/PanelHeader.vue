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
// Section header for the rail panels: underlined in the heading color
// (device headers pass the device color).
withDefaults(defineProps<{ label?: string; color?: string }>(), { label: '', color: '' })
</script>

<template>
    <div
        class="mb-1 flex items-end justify-between gap-2 border-b px-2 pb-1 pt-2"
        :style="{ borderColor: color || 'rgb(var(--colors-text-color-secondary) / 0.4)' }"
    >
        <span
            class="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium uppercase"
            :class="{ 'text-text-color-secondary': !color }"
            :style="color ? { color } : {}"
        >
            <slot name="label">{{ label }}</slot>
        </span>
        <slot />
    </div>
</template>
