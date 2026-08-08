<!--
  SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// Component boundary with primitive props so an open tooltip survives parent
// re-renders (see MenuHealthIcon.vue); the Info page updates on every log line.
interface Props {
    label: string
    tooltip: string
}
const props = defineProps<Props>()
</script>

<template>
    <span
        v-tooltip.top="{ escape: false, value: props.tooltip }"
        class="font-bold text-lg cursor-help"
        >{{ props.label }}</span
    >
</template>
