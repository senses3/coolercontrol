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
withDefaults(defineProps<{ label?: string; description?: string }>(), {
    label: '',
    description: '',
})
</script>

<template>
    <!-- flex-wrap: when the label cannot fit beside the control (basis-40 is
         its minimum), the control drops to its own right-aligned line rather
         than ever overlapping the text. -->
    <div class="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <div class="flex min-w-0 flex-1 basis-40 flex-col">
            <!-- Plain span (not inline-flex) with explicit whitespace-normal
                 so long labels always wrap within the label column. -->
            <span class="whitespace-normal break-words text-base text-text-color">
                <slot name="label">{{ label }}</slot>
            </span>
            <span v-if="description" class="pt-0.5 text-sm text-text-color-secondary">
                {{ description }}
            </span>
        </div>
        <div class="ml-auto flex shrink-0 items-center justify-end">
            <slot />
        </div>
    </div>
</template>
