<!--
  SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// Guard next to a bounded control: unlocked lets the control reach values
// outside its recommended band, and colors itself to say so.
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiLockOpenVariantOutline, mdiLockOutline } from '@mdi/js'
import { computed } from 'vue'

const unlocked = defineModel<boolean>({ required: true })
const icon = computed(() => (unlocked.value ? mdiLockOpenVariantOutline : mdiLockOutline))
</script>

<template>
    <button
        type="button"
        class="inline-flex h-10 w-8 items-center justify-center rounded-lg outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
        :class="unlocked ? 'text-warning' : 'text-text-color-secondary hover:text-text-color'"
        :aria-pressed="unlocked"
        @click="unlocked = !unlocked"
    >
        <svg-icon type="mdi" :path="icon" :size="16" />
    </button>
</template>
