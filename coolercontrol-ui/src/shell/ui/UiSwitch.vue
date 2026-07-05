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
import { SwitchRoot, SwitchThumb } from 'reka-ui'

const model = defineModel<boolean>({ required: true })
withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false })
</script>

<template>
    <SwitchRoot
        v-model="model"
        :disabled="disabled"
        class="relative h-6 w-11 shrink-0 cursor-pointer rounded-full border border-border-one bg-bg-one outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
    >
        <SwitchThumb
            class="block h-4 w-4 translate-x-1 rounded-full bg-text-color-secondary transition-transform data-[state=checked]:translate-x-6 data-[state=checked]:bg-white"
        />
    </SwitchRoot>
</template>
