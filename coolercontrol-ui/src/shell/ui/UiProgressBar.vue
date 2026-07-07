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

const props = withDefaults(defineProps<{ value?: number }>(), { value: 0 })

const clamped = computed(() => Math.min(100, Math.max(0, props.value)))
</script>

<template>
    <div
        class="relative h-3 overflow-hidden rounded-md border border-border-one bg-bg-two"
        role="progressbar"
        :aria-valuenow="clamped"
        aria-valuemin="0"
        aria-valuemax="100"
    >
        <div
            class="h-full bg-accent transition-[width] duration-1000 ease-in-out"
            :style="{ width: `${clamped}%` }"
        />
    </div>
</template>
