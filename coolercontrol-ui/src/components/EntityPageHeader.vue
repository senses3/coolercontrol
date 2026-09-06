<!--
  SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// Header shared by the entity pages: the name, then the entity action cluster
// (apply, duplicate, delete, save) pushed to the right of it. The wider page
// controls take the row below, right-aligned, so the header keeps the same
// shape however long the name is.
// The default slot takes full-width rows below the header (used-by lists,
// health warnings), which stay inside the root so height observers see them.
</script>

<template>
    <div class="flex shrink-0 flex-col px-2 pt-2">
        <!-- min-h is the height of a p-2-wrapped h-10 control, so the name row
             keeps that band even when the actions are only icon buttons. -->
        <div class="flex min-h-14 flex-wrap items-center justify-end gap-x-1">
            <slot name="title" />
            <!-- Zero-basis spacer: takes the name row's slack so the actions
                 sit hard right, and never triggers a wrap of its own. -->
            <div class="min-w-0 flex-1" aria-hidden="true" />
            <div v-if="$slots.actions" class="flex shrink-0 items-center gap-x-1">
                <slot name="actions" />
            </div>
            <!-- w-full: the controls always take a row of their own, so the
                 header keeps one shape no matter how long the name is. -->
            <div
                v-if="$slots.controls"
                class="flex w-full flex-wrap items-center justify-end gap-x-1"
            >
                <slot name="controls" />
            </div>
        </div>
        <slot />
    </div>
</template>
