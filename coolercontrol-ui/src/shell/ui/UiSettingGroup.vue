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
// Titled run of UiSettingRow entries inside a UiSettingsCard. The title caps a
// bordered block of rows, with whitespace above it doing the separating: the
// high-contrast themes collapse bg-one and bg-two to the same color, so a
// tinted header band would be invisible there. The card's own divider between
// children is suppressed, otherwise it reads as one more row boundary.
defineProps<{ title: string }>()
</script>

<template>
    <div class="!border-t-0 pt-5 first:pt-3">
        <div
            class="px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-text-color-secondary"
        >
            {{ title }}
        </div>
        <div class="divide-y divide-border-one border-t border-border-one">
            <slot />
        </div>
    </div>
</template>
