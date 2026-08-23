<!--
  SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// `id` anchors a row for deep links: the search palette routes to
// /settings/<id> and AppSettings scrolls to and briefly rings it.
withDefaults(defineProps<{ label?: string; description?: string; highlighted?: boolean }>(), {
    label: '',
    description: '',
    highlighted: false,
})
</script>

<template>
    <!-- flex-wrap: when the label cannot fit beside the control (basis-40 is
         its minimum), the control drops to its own right-aligned line rather
         than ever overlapping the text. -->
    <div
        class="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 transition-colors"
        :class="highlighted ? 'rounded-md ring-2 ring-inset ring-accent' : ''"
    >
        <div class="flex min-w-0 flex-1 basis-40 flex-col">
            <!-- Prop labels get a plain wrapping span (long text must wrap,
                 never overflow); slot labels get a flex row so icon+text
                 slot content lays out side by side with a gap. -->
            <span
                class="text-base text-text-color"
                :class="
                    $slots.label
                        ? 'flex flex-wrap items-center gap-1.5'
                        : 'whitespace-normal break-words'
                "
            >
                <slot name="label">{{ label }}</slot>
            </span>
            <span v-if="description" class="pt-0.5 text-sm text-text-color-secondary">
                {{ description }}
            </span>
        </div>
        <div class="ml-auto flex shrink-0 items-center justify-end">
            <slot />
        </div>
    </div>
</template>
