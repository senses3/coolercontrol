<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
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
            class="h-10 w-full rounded-lg border bg-control px-3 pr-10 text-base text-text-color outline-none focus:ring-2 focus:ring-accent disabled:pointer-events-none disabled:opacity-50"
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
