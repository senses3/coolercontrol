<!--
  SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon'
import { mdiHelpCircleOutline } from '@mdi/js'
import { useDeviceStore } from '@/stores/DeviceStore.ts'

// Component boundary with primitive props so an open tooltip survives parent
// re-renders (see MenuHealthIcon.vue); the Info page updates on every log line.
interface Props {
    tooltip: string
}
const props = defineProps<Props>()
const deviceStore = useDeviceStore()
</script>

<template>
    <svg-icon
        v-tooltip.top="{ escape: false, value: props.tooltip }"
        type="mdi"
        class="text-warning cursor-help"
        :path="mdiHelpCircleOutline"
        :size="deviceStore.getREMSize(1.25)"
    />
</template>
