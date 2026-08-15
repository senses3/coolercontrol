<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// The monitoring section landing in both modes. A switch component rather than a
// router guard: the router resolves outside any component, where a pinia store
// cannot be built (see shell/__tests__/sections.spec.ts).
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import DashboardView from '@/views/DashboardView.vue'
import SensorsLanding from '@/shell/simple/SensorsLanding.vue'

const settingsStore = useSettingsStore()
</script>

<template>
    <SensorsLanding v-if="settingsStore.isSimpleMode" />
    <DashboardView v-else />
</template>
