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
import { mdiEyeOffOutline, mdiEyeOutline } from '@mdi/js'
import { ref } from 'vue'

const model = defineModel<string>({ required: true })
withDefaults(defineProps<{ placeholder?: string; disabled?: boolean; invalid?: boolean }>(), {
    placeholder: '',
    disabled: false,
    invalid: false,
})

// inheritAttrs:false so listeners/attrs (@keydown.enter, autocomplete, id, ...)
// land on the inner <input>, not the wrapper.
defineOptions({ inheritAttrs: false })

const revealed = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
defineExpose({ focus: () => inputRef.value?.focus() })
</script>

<template>
    <div class="relative inline-flex w-full items-center">
        <input
            ref="inputRef"
            v-model="model"
            v-bind="$attrs"
            :type="revealed ? 'text' : 'password'"
            :placeholder="placeholder"
            :disabled="disabled"
            class="h-10 w-full rounded-lg border bg-bg-one px-3 pr-10 text-base text-text-color outline-none focus:ring-2 focus:ring-accent disabled:pointer-events-none disabled:opacity-50"
            :class="invalid ? 'border-error' : 'border-border-one'"
        />
        <button
            type="button"
            tabindex="-1"
            :aria-label="revealed ? 'hide password' : 'show password'"
            class="absolute right-2 rounded p-1 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
            @click="revealed = !revealed"
        >
            <svg-icon type="mdi" :path="revealed ? mdiEyeOffOutline : mdiEyeOutline" :size="18" />
        </button>
    </div>
</template>
