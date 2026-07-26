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
import type { ThemeSwatch } from '@/shell/themes.ts'

// Page, card, accent and text, so a theme is recognizable before applying it.
defineProps<{ colors?: ThemeSwatch }>()
</script>

<template>
    <span
        v-if="colors"
        class="flex h-4 shrink-0 overflow-hidden rounded border border-border-one"
        aria-hidden="true"
    >
        <span
            v-for="(color, index) in colors"
            :key="index"
            class="h-full w-2"
            :style="{ backgroundColor: color }"
        />
    </span>
</template>
