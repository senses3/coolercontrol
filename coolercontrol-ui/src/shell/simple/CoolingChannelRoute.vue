<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// The channel route in both modes. A switch component rather than a router
// guard: the router resolves outside any component, where a pinia store cannot
// be built (see shell/__tests__/sections.spec.ts).
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import type { UID } from '@/models/Device.ts'
import ChannelPage from '@/shell/cooling/ChannelPage.vue'
import FanPage from '@/shell/simple/FanPage.vue'

defineProps<{ deviceUID: UID; channelName: string }>()

const settingsStore = useSettingsStore()
</script>

<template>
    <FanPage
        v-if="settingsStore.isSimpleMode"
        :device-u-i-d="deviceUID"
        :channel-name="channelName"
    />
    <ChannelPage v-else :device-u-i-d="deviceUID" :channel-name="channelName" />
</template>
