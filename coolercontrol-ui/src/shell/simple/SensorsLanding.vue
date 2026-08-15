<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Device, UID } from '@/models/Device.ts'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { channelKind, channelKindIcon, channelSpins } from '@/shell/channelIcon.ts'
import { monitoringSensors, type MonitoringSensor } from '@/shell/monitoring/sensors.ts'

const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const { currentDeviceStatus } = storeToRefs(deviceStore)

const groups = computed(() => monitoringSensors(deviceStore.allDevices()))

const devicesByUid = computed(() => {
    const map = new Map<UID, Device>()
    for (const device of deviceStore.allDevices()) map.set(device.uid, device)
    return map
})

const deviceLabel = (deviceUID: UID): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.name ?? deviceUID

const deviceColor = (deviceUID: UID): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.userColor ?? ''

const sensorLabel = (sensor: MonitoringSensor): string =>
    settingsStore.allUIDeviceSettings
        .get(sensor.deviceUID)
        ?.sensorsAndChannels.get(sensor.channelName)?.name ?? sensor.channelName

const sensorColor = (sensor: MonitoringSensor): string =>
    settingsStore.allUIDeviceSettings
        .get(sensor.deviceUID)
        ?.sensorsAndChannels.get(sensor.channelName)?.color ?? ''

const sensorValues = (sensor: MonitoringSensor) =>
    currentDeviceStatus.value.get(sensor.deviceUID)?.get(sensor.channelName)

const sensorKind = (sensor: MonitoringSensor) =>
    channelKind(devicesByUid.value.get(sensor.deviceUID), sensor.channelName, sensorValues(sensor))

const sensorIcon = (sensor: MonitoringSensor): string => channelKindIcon(sensorKind(sensor))

const sensorSpins = (sensor: MonitoringSensor): boolean =>
    channelSpins(sensorKind(sensor), sensorValues(sensor), settingsStore.eyeCandy)

// Primary live value, in the same order and formats the monitoring panel uses:
// temp > watts > freq > load (duty) > rpm.
const liveValue = (sensor: MonitoringSensor): string => {
    const values = sensorValues(sensor)
    if (values == null) return '--'
    if (values.temp != null) return `${values.temp} ${t('common.tempUnit')}`
    if (values.watts != null) return `${values.watts} ${t('common.wattAbbr')}`
    if (values.freq != null) {
        const precision = settingsStore.frequencyPrecision
        return precision === 1
            ? `${values.freq} ${t('common.mhzAbbr')}`
            : `${(Number(values.freq) / precision).toFixed(2)} ${t('common.ghzAbbr')}`
    }
    if (values.duty != null) return `${values.duty} ${t('common.percentUnit')}`
    if (values.rpm != null) return `${values.rpm} ${t('common.rpmAbbr')}`
    return '--'
}

// The single-channel chart, which simple mode keeps inside Sensors rather than
// sending a fan over to its cooling page.
const sensorRoute = (sensor: MonitoringSensor) => ({
    name: 'monitoring-sensor',
    params: { deviceUID: sensor.deviceUID, channelName: sensor.channelName },
})
</script>

<template>
    <div class="flex h-full flex-col overflow-y-auto">
        <div class="flex flex-wrap items-center gap-3 px-4 pt-4">
            <h1 class="text-xl font-semibold text-text-color">
                {{ t('layout.shell.simple.sensors') }}
            </h1>
            <span class="text-base text-text-color-secondary">
                {{ t('layout.shell.simple.sensorsHint') }}
            </span>
        </div>
        <template v-if="groups.length > 0">
            <section v-for="group in groups" :key="group.deviceUID" class="px-4 pt-4">
                <h2
                    class="truncate pb-2 text-sm font-medium uppercase tracking-wide"
                    :class="{ 'text-text-color-secondary': !deviceColor(group.deviceUID) }"
                    :style="
                        deviceColor(group.deviceUID) ? { color: deviceColor(group.deviceUID) } : {}
                    "
                >
                    {{ deviceLabel(group.deviceUID) }}
                </h2>
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    <RouterLink
                        v-for="sensor in group.sensors"
                        :key="`${sensor.deviceUID}-${sensor.channelName}`"
                        :to="sensorRoute(sensor)"
                        class="flex items-center gap-3 rounded-lg border border-border-one bg-bg-two p-3 outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
                        :style="{
                            borderLeftColor: sensorColor(sensor),
                            borderLeftWidth: '3px',
                        }"
                    >
                        <svg-icon
                            type="mdi"
                            :path="sensorIcon(sensor)"
                            :size="20"
                            class="shrink-0"
                            :class="{ 'animate-spin-slow': sensorSpins(sensor) }"
                            :style="{ color: sensorColor(sensor) || undefined }"
                        />
                        <span class="min-w-0 truncate font-medium text-text-color">
                            {{ sensorLabel(sensor) }}
                        </span>
                        <span
                            class="ml-auto whitespace-nowrap text-xl font-semibold font-numeric tabular-nums text-text-color"
                        >
                            {{ liveValue(sensor) }}
                        </span>
                    </RouterLink>
                </div>
            </section>
            <div class="pb-6" />
        </template>
        <div v-else class="flex flex-1 items-center justify-center text-text-color-secondary">
            {{ t('layout.shell.simple.noSensors') }}
        </div>
    </div>
</template>
