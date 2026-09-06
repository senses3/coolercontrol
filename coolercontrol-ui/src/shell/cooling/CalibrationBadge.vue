<!--
  SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// Marks a channel whose readings the daemon actually remaps, and opens its
// curve. Absent entirely when nothing has been calibrated, so it reads as a
// positive signal rather than another always-on badge.
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiSpeedometer, mdiSpeedometerSlow } from '@mdi/js'
import { computed } from 'vue'
import { useCalibrationCurve } from '@/composables/useCalibrationCurve.ts'
import type { UID } from '@/models/Device.ts'

const props = withDefaults(defineProps<{ deviceUID: UID; channelName: string; size?: number }>(), {
    size: 14,
})

const { calibration, mapped, statusText, openCurve } = useCalibrationCurve(
    props.deviceUID,
    props.channelName,
)

// The speedometer is the app's calibration mark (Home page, Channel Setup Menu).
// Its slow variant carries the degraded case in the shape as well as the
// dimming, so a passthrough calibration still reads as one at a glance.
const icon = computed(() => (mapped.value ? mdiSpeedometer : mdiSpeedometerSlow))
</script>

<template>
    <button
        v-if="calibration != null"
        type="button"
        v-tooltip.top="statusText"
        class="shrink-0 rounded outline-none text-accent hover:opacity-100 focus-visible:ring-2 focus-visible:ring-accent"
        :class="mapped ? '' : 'opacity-40'"
        @click.stop.prevent="openCurve"
    >
        <svg-icon type="mdi" :path="icon" :size="size" />
    </button>
</template>
