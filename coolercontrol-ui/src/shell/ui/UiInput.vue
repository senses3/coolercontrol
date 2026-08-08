<!--
  SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import { onMounted, ref } from 'vue'

const model = defineModel<string>({ required: true })
const props = withDefaults(
    defineProps<{ placeholder?: string; disabled?: boolean; autofocus?: boolean }>(),
    { placeholder: '', disabled: false, autofocus: false },
)

// Mirror PrimeVue InputText's `autofocus`. Two mechanisms cover both hosts:
// rendering the `[autofocus]` attribute lets the PrimeVue Dialog's open-focus
// logic pick it (its own focus runs after our onMounted, so a plain focus()
// gets overridden); the onMounted focus() covers non-dialog / kit contexts.
const inputRef = ref<HTMLInputElement | null>(null)
onMounted(() => {
    if (props.autofocus) inputRef.value?.focus()
})
</script>

<template>
    <input
        ref="inputRef"
        v-model="model"
        type="text"
        :autofocus="autofocus"
        :placeholder="placeholder"
        :disabled="disabled"
        class="h-10 rounded-lg border border-border-one bg-control px-3 text-base text-text-color outline-none focus:ring-2 focus:ring-accent disabled:pointer-events-none disabled:opacity-50"
    />
</template>
