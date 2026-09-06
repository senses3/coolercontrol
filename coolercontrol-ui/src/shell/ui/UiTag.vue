<!--
  SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import { computed } from 'vue'

type Severity = 'primary' | 'secondary' | 'success' | 'info' | 'warn' | 'danger'

const props = withDefaults(defineProps<{ value?: string; severity?: Severity }>(), {
    value: '',
    severity: 'primary',
})

// Themed tokens, not the palette hues. The hues are fixed globals that no theme
// overrides, so a tag drawn from them keeps one color under every theme and skips the
// contrast floor `themes.spec.ts` holds the status colors to. On the light themes that
// gap is visible: `green` stays #00ff7f where `success` darkens to #166534 to stay
// readable.
const severities: Record<Severity, string> = {
    primary: 'bg-accent/40',
    secondary: 'bg-border-one',
    success: 'bg-success/40',
    info: 'bg-info/40',
    warn: 'bg-warning/40',
    danger: 'bg-error/40',
}

const classes = computed(() => severities[props.severity])
</script>

<template>
    <span
        class="inline-flex items-center justify-center rounded-lg px-2 py-1 text-xs font-bold text-text-color"
        :class="classes"
    >
        <slot>{{ value }}</slot>
    </span>
</template>
