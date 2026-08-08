<!--
  SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ value?: number }>(), { value: 0 })

const clamped = computed(() => Math.min(100, Math.max(0, props.value)))
</script>

<template>
    <div
        class="relative h-3 overflow-hidden rounded-md border border-border-one bg-bg-two"
        role="progressbar"
        :aria-valuenow="clamped"
        aria-valuemin="0"
        aria-valuemax="100"
    >
        <div
            class="h-full bg-accent transition-[width] duration-1000 ease-in-out"
            :style="{ width: `${clamped}%` }"
        />
    </div>
</template>
