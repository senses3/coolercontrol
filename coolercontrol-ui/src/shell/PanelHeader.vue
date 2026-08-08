<!--
  SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// Section header for the rail panels: underlined in the heading color
// (device headers pass the device color).
withDefaults(defineProps<{ label?: string; color?: string }>(), { label: '', color: '' })
</script>

<template>
    <div
        class="mb-1 flex items-end justify-between gap-2 border-b px-2 pb-1 pt-2"
        :style="{ borderColor: color || 'rgb(var(--colors-text-color-secondary) / 0.4)' }"
    >
        <span
            class="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium uppercase"
            :class="{ 'text-text-color-secondary': !color }"
            :style="color ? { color } : {}"
        >
            <slot name="label">{{ label }}</slot>
        </span>
        <slot />
    </div>
</template>
