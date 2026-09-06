<!--
  SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// Titled run of UiSettingRow entries inside a UiSettingsCard. The title caps a
// bordered block of rows, with whitespace above it doing the separating: the
// high-contrast themes collapse bg-one and bg-two to the same color, so a
// tinted header band would be invisible there. The card's own divider between
// children is suppressed, otherwise it reads as one more row boundary.
defineProps<{ title: string }>()
</script>

<template>
    <div class="!border-t-0 pt-5 first:pt-3">
        <div
            class="px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-text-color-secondary"
        >
            {{ title }}
        </div>
        <div class="divide-y divide-border-one border-t border-border-one">
            <slot />
        </div>
    </div>
</template>
