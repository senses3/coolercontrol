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
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import type { UID } from '@/models/Device.ts'
import { useDeviceStore } from '@/stores/DeviceStore.ts'

const props = defineProps<{
    deviceUID: UID
    channelName: string
    color?: string
}>()

const deviceStore = useDeviceStore()
// The tick ref: reading it in the computed makes the sparkline redraw per status update.
const { currentDeviceStatus } = storeToRefs(deviceStore)

const points = computed<string>(() => {
    void currentDeviceStatus.value
    let device = undefined
    for (const candidate of deviceStore.allDevices()) {
        if (candidate.uid === props.deviceUID) {
            device = candidate
            break
        }
    }
    if (device == null) return ''
    const duties: number[] = []
    for (const status of device.status_history) {
        const duty = status.channels.find((channel) => channel.name === props.channelName)?.duty
        if (duty != null) duties.push(duty)
    }
    const recent = duties.slice(-60)
    if (recent.length < 2) return ''
    return recent
        .map((duty, index) => {
            const x = ((index / (recent.length - 1)) * 100).toFixed(1)
            const y = (27 - (Math.min(Math.max(duty, 0), 100) / 100) * 26).toFixed(1)
            return `${x},${y}`
        })
        .join(' ')
})
</script>

<template>
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" class="h-7 w-full">
        <polyline
            :points="points"
            fill="none"
            :stroke="color || 'currentColor'"
            stroke-width="1.5"
            vector-effect="non-scaling-stroke"
        />
    </svg>
</template>
