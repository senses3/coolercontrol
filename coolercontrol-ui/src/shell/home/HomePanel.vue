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
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import {
    mdiDragVertical,
    mdiFan,
    mdiHomeOutline,
    mdiTextBoxOutline,
    mdiViewDashboardOutline,
} from '@mdi/js'
import { VueDraggable } from 'vue-draggable-plus'
import { storeToRefs } from 'pinia'
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { DeviceType, type Device, type UID } from '@/models/Device.ts'
import { Dashboard } from '@/models/Dashboard.ts'
import PanelHeader from '@/shell/PanelHeader.vue'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { coolingChannels, pinId } from '@/shell/cooling/channels.ts'
import { reorderSubset } from '@/shell/panelOrder.ts'
import { monitoringSensors } from '@/shell/monitoring/sensors.ts'
import { channelKind, channelKindIcon, channelSpins } from '@/shell/channelIcon.ts'
import UiSeparator from '@/shell/ui/UiSeparator.vue'

const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const { currentDeviceStatus } = storeToRefs(deviceStore)

// The Home panel shows everything pinned anywhere: fans open their cooling
// page, custom sensors their editor under Devices, other sensors their
// monitoring page, dashboards their dashboard.
interface PinnedRow {
    key: string
    label: string
    sublabel?: string
    color?: string
    value?: string
    icon?: string
    spins?: boolean
    to: object
}

const label = (deviceUID: UID, channelName: string): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.sensorsAndChannels.get(channelName)?.name ??
    channelName

const color = (deviceUID: UID, channelName: string): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.sensorsAndChannels.get(channelName)?.color ??
    ''

const deviceLabel = (deviceUID: UID): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.name ?? deviceUID

const liveValue = (deviceUID: UID, channelName: string): string => {
    const values = currentDeviceStatus.value.get(deviceUID)?.get(channelName)
    if (values == null) return ''
    if (values.duty != null) return `${values.duty} ${t('common.percentUnit')}`
    if (values.temp != null) return `${values.temp} ${t('common.tempUnit')}`
    if (values.watts != null) return `${values.watts} ${t('common.wattAbbr')}`
    if (values.freq != null) {
        const precision = settingsStore.frequencyPrecision
        return precision === 1
            ? `${values.freq} ${t('common.mhzAbbr')}`
            : `${(Number(values.freq) / precision).toFixed(2)} ${t('common.ghzAbbr')}`
    }
    if (values.rpm != null) return `${values.rpm} ${t('common.rpmAbbr')}`
    return ''
}

const buildPinnedRows = (): PinnedRow[] => {
    const rows: PinnedRow[] = []
    const seen = new Set<string>()
    const dashboardsByUid = new Map<string, Dashboard>(
        settingsStore.dashboards.map((dashboard) => [dashboard.uid, dashboard]),
    )
    const devicesByUid = new Map<UID, Device>()
    for (const device of deviceStore.allDevices()) devicesByUid.set(device.uid, device)
    const fanIds = new Set(
        coolingChannels(deviceStore.allDevices()).flatMap((group) =>
            group.channels.map((channel) => pinId(channel.deviceUID, channel.channelName)),
        ),
    )
    const sensorIds = new Set(
        monitoringSensors(deviceStore.allDevices()).flatMap((group) =>
            group.sensors.map((sensor) => pinId(sensor.deviceUID, sensor.channelName)),
        ),
    )
    for (const id of settingsStore.pinnedIds) {
        if (seen.has(id)) continue
        seen.add(id)
        const dashboard = dashboardsByUid.get(id)
        if (dashboard != null) {
            rows.push({
                key: id,
                label: dashboard.name,
                to: { name: 'monitoring-dashboard', params: { dashboardUID: dashboard.uid } },
            })
            continue
        }
        const separator = id.indexOf('_')
        if (separator === -1) continue
        const deviceUID = id.slice(0, separator)
        const channelName = id.slice(separator + 1)
        const values = currentDeviceStatus.value.get(deviceUID)?.get(channelName)
        const base = {
            key: id,
            label: label(deviceUID, channelName),
            sublabel: deviceLabel(deviceUID),
            color: color(deviceUID, channelName),
            value: liveValue(deviceUID, channelName),
        }
        if (fanIds.has(id)) {
            rows.push({
                ...base,
                icon: mdiFan,
                spins: channelSpins('fan', values, settingsStore.eyeCandy),
                to: { name: 'cooling-channel', params: { deviceUID, channelName } },
            })
        } else if (sensorIds.has(id)) {
            // Custom sensors are user-configured, so link to their editor under
            // Devices rather than a read-only monitoring page.
            const isCustomSensor = devicesByUid.get(deviceUID)?.type === DeviceType.CUSTOM_SENSORS
            rows.push({
                ...base,
                icon: channelKindIcon(
                    channelKind(devicesByUid.get(deviceUID), channelName, values),
                ),
                to: isCustomSensor
                    ? { name: 'device-custom-sensor', params: { customSensorID: channelName } }
                    : { name: 'monitoring-sensor', params: { deviceUID, channelName } },
            })
        }
    }
    return rows
}
const pinnedRows = ref<PinnedRow[]>([])
watchEffect(() => {
    pinnedRows.value = buildPinnedRows()
})
const persistPinnedOrder = (): void => {
    settingsStore.pinnedIds = reorderSubset(
        settingsStore.pinnedIds,
        pinnedRows.value.map((row) => row.key),
    )
}
</script>

<template>
    <div class="flex flex-col gap-0.5 p-2 pb-24 text-base">
        <RouterLink
            :to="{ name: 'section-home' }"
            class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
            exact-active-class="bg-surface-hover !text-accent"
        >
            <svg-icon
                type="mdi"
                :path="mdiHomeOutline"
                :size="14"
                class="shrink-0 text-text-color-secondary"
            />
            {{ t('layout.shell.homePanel.overview') }}
        </RouterLink>
        <RouterLink
            :to="{ name: 'home-logs' }"
            class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
            exact-active-class="bg-surface-hover !text-accent"
        >
            <svg-icon
                type="mdi"
                :path="mdiTextBoxOutline"
                :size="14"
                class="shrink-0 text-text-color-secondary"
            />
            {{ t('layout.shell.homePanel.logs') }}
        </RouterLink>

        <template v-if="pinnedRows.length > 0">
            <UiSeparator class="my-1" />
            <PanelHeader :label="t('layout.menu.pinned')" />
            <VueDraggable
                v-model="pinnedRows"
                handle=".drag-handle"
                :animation="150"
                class="flex flex-col gap-0.5"
                @end="persistPinnedOrder"
            >
                <RouterLink
                    v-for="row in pinnedRows"
                    :key="row.key"
                    :to="row.to"
                    class="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
                    exact-active-class="!text-accent"
                >
                    <svg-icon
                        v-if="row.icon"
                        type="mdi"
                        :path="row.icon"
                        :size="14"
                        class="shrink-0"
                        :class="{ 'animate-spin-slow': row.spins }"
                        :style="{ color: row.color || undefined }"
                    />
                    <svg-icon
                        v-else
                        type="mdi"
                        :path="mdiViewDashboardOutline"
                        :size="14"
                        class="shrink-0 text-text-color-secondary"
                    />
                    <span class="truncate">{{ row.label }}</span>
                    <!-- Huge shrink so the sublabel (device name) fully collapses
                         before the label (truncate, shrink-1) gives up any space. -->
                    <span
                        v-if="row.sublabel"
                        class="shrink-[9999] truncate text-xs text-text-color-secondary"
                    >
                        {{ row.sublabel }}
                    </span>
                    <span
                        v-if="row.value"
                        class="ml-auto whitespace-nowrap tabular-nums text-text-color group-hover:hidden"
                    >
                        {{ row.value }}
                    </span>
                    <span
                        class="drag-handle ml-auto hidden cursor-grab p-0.5 text-text-color-secondary group-hover:inline-flex"
                    >
                        <svg-icon type="mdi" :path="mdiDragVertical" :size="14" />
                    </span>
                </RouterLink>
            </VueDraggable>
        </template>
    </div>
</template>
