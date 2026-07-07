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
