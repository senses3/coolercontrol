<!--
  - CoolerControl - monitor and control your cooling and other devices
  - Copyright (c) 2021-2025  Guy Boldon and contributors
  -
  - This program is free software: you can redistribute it and/or modify
  - it under the terms of the GNU General Public License as published by
  - the Free Software Foundation, either version 3 of the License, or
  - (at your option) any later version.
  -
  - This program is distributed in the hope that it will be useful,
  - but WITHOUT ANY WARRANTY; without even the implied warranty of
  - MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  - GNU General Public License for more details.
  -
  - You should have received a copy of the GNU General Public License
  - along with this program.  If not, see <https://www.gnu.org/licenses/>.
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
