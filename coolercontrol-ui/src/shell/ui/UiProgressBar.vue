<!--
  SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ value?: number; label?: string }>(), {
    value: 0,
    label: '',
})

const clamped = computed(() => Math.min(100, Math.max(0, props.value)))
</script>

<template>
    <div
        class="relative flex min-h-3 items-center justify-center overflow-hidden rounded-md border border-border-one bg-bg-two"
        role="progressbar"
        :aria-valuenow="clamped"
        aria-valuemin="0"
        aria-valuemax="100"
    >
        <div
            class="absolute inset-y-0 left-0 bg-accent transition-[width] duration-1000 ease-in-out"
            :style="{ width: `${clamped}%` }"
        />
        <span v-if="label" class="relative whitespace-nowrap px-2 py-0.5 text-xs">
            {{ label }}
        </span>
        <!-- The same label clipped to the filled span, so it stays legible
             where the accent fill runs under it. -->
        <span
            v-if="label"
            aria-hidden="true"
            class="absolute inset-0 flex items-center justify-center whitespace-nowrap px-2 text-xs text-accent-fg transition-[clip-path] duration-1000 ease-in-out"
            :style="{ clipPath: `inset(0 ${100 - clamped}% 0 0)` }"
        >
            {{ label }}
        </span>
    </div>
</template>
