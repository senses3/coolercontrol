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
// Marks a channel whose readings the daemon actually remaps, and opens its
// curve. Absent entirely when nothing has been calibrated, so it reads as a
// positive signal rather than another always-on badge.
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiChartLine } from '@mdi/js'
import { useCalibrationCurve } from '@/composables/useCalibrationCurve.ts'
import type { UID } from '@/models/Device.ts'

const props = withDefaults(defineProps<{ deviceUID: UID; channelName: string; size?: number }>(), {
    size: 14,
})

const { calibration, mapped, statusText, openCurve } = useCalibrationCurve(
    props.deviceUID,
    props.channelName,
)
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
        <svg-icon type="mdi" :path="mdiChartLine" :size="size" />
    </button>
</template>
