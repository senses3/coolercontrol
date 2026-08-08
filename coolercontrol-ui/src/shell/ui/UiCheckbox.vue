<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
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
