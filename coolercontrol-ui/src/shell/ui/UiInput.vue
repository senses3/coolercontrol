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
const model = defineModel<string>({ required: true })
withDefaults(defineProps<{ placeholder?: string; disabled?: boolean }>(), {
    placeholder: '',
    disabled: false,
})
</script>

<template>
    <input
        v-model="model"
        type="text"
        :placeholder="placeholder"
        :disabled="disabled"
        class="h-10 rounded-lg border border-border-one bg-bg-one px-3 text-base text-text-color outline-none focus:ring-2 focus:ring-accent disabled:pointer-events-none disabled:opacity-50"
    />
</template>
