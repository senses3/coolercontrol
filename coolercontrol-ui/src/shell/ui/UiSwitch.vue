<!--
  SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'

const model = defineModel<boolean>({ required: true })
// twoSided: both positions are valid choices (e.g. 12h/24h), so the track
// stays accent-colored in the off position too.
withDefaults(defineProps<{ disabled?: boolean; twoSided?: boolean }>(), {
    disabled: false,
    twoSided: false,
})
</script>

<template>
    <SwitchRoot
        v-model="model"
        :disabled="disabled"
        class="relative h-6 w-11 shrink-0 cursor-pointer rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
        :class="twoSided ? 'border-accent bg-accent' : 'border-border-one bg-control'"
    >
        <SwitchThumb
            class="block h-4 w-4 translate-x-1 rounded-full transition-transform data-[state=checked]:translate-x-6 data-[state=checked]:bg-white"
            :class="twoSided ? 'bg-white' : 'bg-text-color-secondary'"
        />
    </SwitchRoot>
</template>
