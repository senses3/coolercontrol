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
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiCheck, mdiMinus } from '@mdi/js'
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'

// Binary checkbox: the boolean lives in v-model, while `indeterminate` is a
// separate presentational flag (the parent owns the tri-state, as with the
// select-all pattern). A click always resolves to a concrete boolean.
const model = defineModel<boolean>({ required: true })
withDefaults(defineProps<{ indeterminate?: boolean; disabled?: boolean }>(), {
    indeterminate: false,
    disabled: false,
})
</script>

<template>
    <CheckboxRoot
        :model-value="indeterminate ? 'indeterminate' : model"
        :disabled="disabled"
        class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
        :class="
            indeterminate || model
                ? 'border-accent bg-accent'
                : 'border-border-one bg-bg-one hover:bg-surface-hover'
        "
        @update:model-value="model = $event === true"
    >
        <CheckboxIndicator class="flex items-center justify-center text-white">
            <svg-icon type="mdi" :path="indeterminate ? mdiMinus : mdiCheck" :size="16" />
        </CheckboxIndicator>
    </CheckboxRoot>
</template>
