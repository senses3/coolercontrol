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
// Card of UiSettingRow entries; the row group style shared by the settings
// pages and entity editors.
withDefaults(defineProps<{ title?: string }>(), { title: '' })
</script>

<template>
    <div class="rounded-lg border border-border-one bg-bg-two">
        <div
            v-if="title || $slots.title"
            class="border-b border-border-one px-4 py-3 text-base font-semibold text-text-color"
        >
            <slot name="title">{{ title }}</slot>
        </div>
        <div class="divide-y divide-border-one">
            <slot />
        </div>
    </div>
</template>
