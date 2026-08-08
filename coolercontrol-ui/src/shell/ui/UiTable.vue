<!--
  SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// Styled table shell: consumers supply <tr> rows via the head and default
// slots. Cell padding/borders are applied here; override with !-utilities.
// bordered wraps the table (and the optional toolbar slot above it) in a
// rounded component frame; full-page tables stay frameless.
withDefaults(defineProps<{ stickyHeader?: boolean; bordered?: boolean }>(), {
    stickyHeader: false,
    bordered: false,
})
</script>

<template>
    <div :class="{ 'overflow-hidden rounded-lg border border-border-one': bordered }">
        <slot name="toolbar" />
        <table class="w-full border-collapse text-base text-text-color">
            <thead :class="{ 'sticky-head': stickyHeader }">
                <slot name="head" />
            </thead>
            <tbody :class="{ 'last-row-borderless': bordered }">
                <slot />
            </tbody>
        </table>
    </div>
</template>

<style scoped>
thead :deep(th) {
    padding: 1rem;
    text-align: left;
    font-weight: 700;
    background-color: rgb(var(--colors-bg-two));
    border-bottom: 1px solid rgb(var(--colors-border-one));
}
thead.sticky-head :deep(th) {
    position: sticky;
    top: 0;
    z-index: 30;
}
tbody :deep(td) {
    padding: 1rem;
    text-align: left;
    border-bottom: 1px solid rgb(var(--colors-border-one));
}
tbody.last-row-borderless :deep(tr:last-child > td) {
    border-bottom: 0;
}
</style>
