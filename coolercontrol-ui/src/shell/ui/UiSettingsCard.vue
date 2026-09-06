<!--
  SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// Card of UiSettingRow entries; the row group style shared by the settings
// pages and entity editors.
withDefaults(defineProps<{ title?: string }>(), { title: '' })
</script>

<template>
    <div class="rounded-lg border border-border-one bg-bg-two">
        <div
            v-if="title || $slots.title"
            class="border-b border-border-one px-4 py-3 text-base font-semibold text-text-color"
        >
            <slot name="title">{{ title }}</slot>
        </div>
        <div class="divide-y divide-border-one">
            <slot />
        </div>
    </div>
</template>
