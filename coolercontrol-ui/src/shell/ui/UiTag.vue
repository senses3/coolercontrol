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

const severities: Record<Severity, string> = {
    primary: 'bg-accent/40',
    secondary: 'bg-border-one',
    success: 'bg-green/40',
    info: 'bg-blue/40',
    warn: 'bg-yellow/40',
    danger: 'bg-red/40',
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
