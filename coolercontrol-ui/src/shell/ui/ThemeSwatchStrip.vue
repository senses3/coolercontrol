<!--
  SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import type { ThemeSwatch } from '@/shell/themes.ts'

// Page, card, accent and text, so a theme is recognizable before applying it.
defineProps<{ colors?: ThemeSwatch }>()
</script>

<template>
    <span
        v-if="colors"
        class="flex h-4 shrink-0 overflow-hidden rounded border border-border-one"
        aria-hidden="true"
    >
        <span
            v-for="(color, index) in colors"
            :key="index"
            class="h-full w-2"
            :style="{ backgroundColor: color }"
        />
    </span>
</template>
