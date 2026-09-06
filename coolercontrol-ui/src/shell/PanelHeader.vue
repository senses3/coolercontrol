<!--
  SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'

// Section header for the rail panels: underlined in the heading color
// (device headers pass the device color). Given `to`, the whole label band is
// the link and carries the padding with it, so the header answers a click
// anywhere in it the way a channel row does. The trailing slot stays outside.
withDefaults(defineProps<{ label?: string; color?: string; to?: RouteLocationRaw }>(), {
    label: '',
    color: '',
    to: undefined,
})
</script>

<template>
    <div
        class="mb-1 flex items-end justify-between gap-2 border-b"
        :style="{ borderColor: color || 'rgb(var(--colors-text-color-secondary) / 0.4)' }"
    >
        <component
            :is="to != null ? RouterLink : 'span'"
            v-bind="to != null ? { to } : {}"
            class="flex min-w-0 flex-1 items-center gap-1.5 truncate px-2 pb-1 pt-2 text-sm font-medium uppercase outline-none"
            :class="{ 'text-text-color-secondary': !color }"
            :style="color ? { color } : {}"
        >
            <slot name="label">{{ label }}</slot>
        </component>
        <span v-if="$slots.default" class="flex items-center pb-1 pr-2 pt-2">
            <slot />
        </span>
    </div>
</template>
