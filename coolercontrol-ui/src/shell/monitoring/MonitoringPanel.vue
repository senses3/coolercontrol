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
    mdiAlert,
    mdiBellOutline,
    mdiHome,
    mdiPinOff,
    mdiPinOutline,
    mdiPlus,
    mdiViewDashboardOutline,
} from '@mdi/js'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import type { Color, UID } from '@/models/Device.ts'
import { Dashboard } from '@/models/Dashboard.ts'
import { AlertState } from '@/models/Alert.ts'
import CCColorPicker from '@/components/CCColorPicker.vue'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { pinId } from '@/shell/cooling/channels.ts'
import {
    customSensors,
    monitoringSensors,
    type MonitoringSensor,
} from '@/shell/monitoring/sensors.ts'
import TagPopover from '@/shell/monitoring/TagPopover.vue'
import UiSeparator from '@/shell/ui/UiSeparator.vue'

const { t } = useI18n()
const router = useRouter()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const { currentDeviceStatus } = storeToRefs(deviceStore)

const groups = computed(() => monitoringSensors(deviceStore.allDevices()))
const customSensorList = computed(() => customSensors(deviceStore.allDevices()))

const deviceLabel = (deviceUID: UID): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.name ?? deviceUID

const deviceColor = (deviceUID: UID): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.userColor ?? ''

const sensorLabel = (deviceUID: UID, channelName: string): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.sensorsAndChannels.get(channelName)?.name ??
    channelName

const sensorColor = (deviceUID: UID, channelName: string): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.sensorsAndChannels.get(channelName)?.color ??
    ''

// Primary live value: temp > watts > freq > load(duty) > rpm; formats follow
// SensorTable's conventions.
const liveValue = (sensor: MonitoringSensor): string => {
    const values = currentDeviceStatus.value.get(sensor.deviceUID)?.get(sensor.channelName)
    if (values == null) return ''
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
    return ''
}

const isUnhealthy = (deviceUID: UID, channelName: string): boolean =>
    settingsStore.healthFailsafe.some(
        (ref) => ref.device_uid === deviceUID && ref.name === channelName,
    )

const isPinned = (sensor: MonitoringSensor): boolean =>
    settingsStore.pinnedIds.includes(pinId(sensor.deviceUID, sensor.channelName))

const togglePin = (sensor: MonitoringSensor): void => {
    const id = pinId(sensor.deviceUID, sensor.channelName)
    settingsStore.pinnedIds = settingsStore.pinnedIds.includes(id)
        ? settingsStore.pinnedIds.filter((pinned) => pinned !== id)
        : [...settingsStore.pinnedIds, id]
}

const isDashboardPinned = (dashboard: Dashboard): boolean =>
    settingsStore.pinnedIds.includes(dashboard.uid)

const toggleDashboardPin = (dashboard: Dashboard): void =>
    void (settingsStore.pinnedIds = settingsStore.pinnedIds.includes(dashboard.uid)
        ? settingsStore.pinnedIds.filter((pinned) => pinned !== dashboard.uid)
        : [...settingsStore.pinnedIds, dashboard.uid])

const pinnedSensors = computed<MonitoringSensor[]>(() =>
    [...groups.value.flatMap((group) => group.sensors), ...customSensorList.value].filter(
        (sensor) => isPinned(sensor),
    ),
)
const pinnedDashboards = computed<Dashboard[]>(() =>
    settingsStore.dashboards.filter((dashboard) => isDashboardPinned(dashboard)),
)

const setSensorColor = (sensor: MonitoringSensor, newColor: Color): void => {
    const setting = settingsStore.allUIDeviceSettings
        .get(sensor.deviceUID)
        ?.sensorsAndChannels.get(sensor.channelName)
    if (setting != null) setting.userColor = newColor
}

// Home dashboard first, then store order.
const orderedDashboards = computed<Dashboard[]>(() =>
    [...settingsStore.dashboards].sort((a, b) => {
        if (a.uid === settingsStore.homeDashboard) return -1
        if (b.uid === settingsStore.homeDashboard) return 1
        return 0
    }),
)

const addDashboard = (): void => {
    const dashboard = new Dashboard(t('layout.shell.monitoringPanel.newDashboard'))
    settingsStore.dashboards.push(dashboard)
    router.push({ name: 'monitoring-dashboard', params: { dashboardUID: dashboard.uid } })
}

const orderedAlerts = computed(() => {
    const alerts = [...settingsStore.alerts]
    const alertMenuOrder = settingsStore.menuOrder.find((item) => item.id === 'alerts')
    if (alertMenuOrder?.children?.length) {
        const getIndex = (uid: string) => {
            const index = alertMenuOrder.children.indexOf(uid)
            return index >= 0 ? index : Number.MAX_SAFE_INTEGER
        }
        alerts.sort((a, b) => getIndex(a.uid) - getIndex(b.uid))
    }
    return alerts
})
const activeAlertCount = computed(
    () => settingsStore.alerts.filter((alert) => alert.state === AlertState.Active).length,
)

// Keeps a row's hover actions visible while its tag popover is open.
const openTagRow = ref<string | null>(null)
const onTagOpen = (rowKey: string, open: boolean): void => {
    openTagRow.value = open ? rowKey : null
}

const sensorRoute = (sensor: MonitoringSensor, custom: boolean) =>
    custom
        ? { name: 'monitoring-custom-sensor', params: { customSensorID: sensor.channelName } }
        : {
              name: 'monitoring-sensor',
              params: { deviceUID: sensor.deviceUID, channelName: sensor.channelName },
          }
</script>

<template>
    <div class="flex flex-col gap-0.5 p-2 pb-24 text-base">
        <template v-if="pinnedDashboards.length > 0 || pinnedSensors.length > 0">
            <div class="px-2 pb-1 text-xs uppercase text-text-color-secondary">
                {{ t('layout.menu.pinned') }}
            </div>
            <div
                v-for="dashboard in pinnedDashboards"
                :key="`pin-${dashboard.uid}`"
                class="group flex items-center rounded-lg hover:bg-surface-hover focus-within:bg-surface-hover focus-within:ring-2 focus-within:ring-accent"
            >
                <RouterLink
                    :to="{ name: 'monitoring-dashboard', params: { dashboardUID: dashboard.uid } }"
                    class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none"
                    exact-active-class="!text-accent"
                >
                    <svg-icon
                        type="mdi"
                        :path="mdiViewDashboardOutline"
                        :size="14"
                        class="shrink-0 text-text-color-secondary"
                    />
                    <span class="truncate">{{ dashboard.name }}</span>
                </RouterLink>
                <div
                    class="ml-auto hidden items-center gap-0.5 pr-1 group-hover:flex group-focus-within:flex"
                >
                    <button
                        type="button"
                        class="rounded p-1 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                        :title="t('layout.shell.coolingPanel.unpin')"
                        @click.prevent="toggleDashboardPin(dashboard)"
                    >
                        <svg-icon type="mdi" :path="mdiPinOff" :size="16" />
                    </button>
                </div>
            </div>
            <div
                v-for="sensor in pinnedSensors"
                :key="`pin-${sensor.deviceUID}-${sensor.channelName}`"
                class="group flex items-center rounded-lg hover:bg-surface-hover focus-within:bg-surface-hover focus-within:ring-2 focus-within:ring-accent"
            >
                <RouterLink
                    :to="
                        sensorRoute(
                            sensor,
                            customSensorList.some(
                                (cs) =>
                                    cs.deviceUID === sensor.deviceUID &&
                                    cs.channelName === sensor.channelName,
                            ),
                        )
                    "
                    class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none"
                    exact-active-class="!text-accent"
                >
                    <span
                        class="h-2 w-2 shrink-0 rounded-full"
                        :style="{
                            backgroundColor: sensorColor(sensor.deviceUID, sensor.channelName),
                        }"
                    />
                    <span class="truncate">
                        {{ sensorLabel(sensor.deviceUID, sensor.channelName) }}
                    </span>
                    <span class="truncate text-xs text-text-color-secondary">
                        {{ deviceLabel(sensor.deviceUID) }}
                    </span>
                    <span
                        class="ml-auto whitespace-nowrap tabular-nums text-text-color group-hover:hidden group-focus-within:hidden"
                    >
                        {{ liveValue(sensor) }}
                    </span>
                </RouterLink>
                <div
                    class="ml-auto hidden items-center gap-0.5 pr-1 group-hover:flex group-focus-within:flex"
                >
                    <button
                        type="button"
                        class="rounded p-1 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                        :title="t('layout.shell.coolingPanel.unpin')"
                        @click.prevent="togglePin(sensor)"
                    >
                        <svg-icon type="mdi" :path="mdiPinOff" :size="16" />
                    </button>
                </div>
            </div>
            <UiSeparator class="my-1" />
        </template>

        <div class="flex items-center justify-between px-2 pb-1 pt-2">
            <span class="text-xs uppercase text-text-color-secondary">
                {{ t('layout.menu.dashboards') }}
            </span>
            <button
                type="button"
                class="rounded p-0.5 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                :title="t('layout.menu.tooltips.addDashboard')"
                @click="addDashboard"
            >
                <svg-icon type="mdi" :path="mdiPlus" :size="16" />
            </button>
        </div>
        <div
            v-for="dashboard in orderedDashboards"
            :key="dashboard.uid"
            class="group flex items-center rounded-lg hover:bg-surface-hover focus-within:bg-surface-hover focus-within:ring-2 focus-within:ring-accent"
        >
            <RouterLink
                :to="{ name: 'monitoring-dashboard', params: { dashboardUID: dashboard.uid } }"
                class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none"
                exact-active-class="!text-accent"
            >
                <svg-icon
                    type="mdi"
                    :path="mdiViewDashboardOutline"
                    :size="14"
                    class="shrink-0 text-text-color-secondary"
                />
                <span class="truncate">{{ dashboard.name }}</span>
                <svg-icon
                    v-if="dashboard.uid === settingsStore.homeDashboard"
                    type="mdi"
                    :path="mdiHome"
                    :size="14"
                    class="shrink-0 text-text-color-secondary"
                    :title="t('views.dashboard.setAsHome')"
                />
            </RouterLink>
            <div
                class="ml-auto hidden items-center gap-0.5 pr-1 group-hover:flex group-focus-within:flex"
            >
                <button
                    type="button"
                    class="rounded p-1 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                    :title="
                        isDashboardPinned(dashboard)
                            ? t('layout.shell.coolingPanel.unpin')
                            : t('layout.shell.coolingPanel.pin')
                    "
                    @click.prevent="toggleDashboardPin(dashboard)"
                >
                    <svg-icon
                        type="mdi"
                        :path="isDashboardPinned(dashboard) ? mdiPinOff : mdiPinOutline"
                        :size="16"
                    />
                </button>
            </div>
        </div>

        <UiSeparator class="my-1" />
        <div class="flex items-center justify-between px-2 pb-1 pt-2">
            <span class="text-xs uppercase text-text-color-secondary">
                {{ t('layout.menu.customSensors') }}
            </span>
            <button
                type="button"
                class="rounded p-0.5 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                :title="t('layout.menu.tooltips.addCustomSensor')"
                @click="router.push({ name: 'monitoring-custom-sensor-new' })"
            >
                <svg-icon type="mdi" :path="mdiPlus" :size="16" />
            </button>
        </div>
        <div
            v-for="sensor in customSensorList"
            :key="`custom-${sensor.channelName}`"
            class="group flex items-center rounded-lg hover:bg-surface-hover focus-within:bg-surface-hover focus-within:ring-2 focus-within:ring-accent"
        >
            <RouterLink
                :to="sensorRoute(sensor, true)"
                class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none"
                exact-active-class="!text-accent"
            >
                <span
                    class="h-2 w-2 shrink-0 rounded-full"
                    :style="{
                        backgroundColor: sensorColor(sensor.deviceUID, sensor.channelName),
                    }"
                />
                <span class="truncate">
                    {{ sensorLabel(sensor.deviceUID, sensor.channelName) }}
                </span>
                <svg-icon
                    v-if="isUnhealthy(sensor.deviceUID, sensor.channelName)"
                    type="mdi"
                    :path="mdiAlert"
                    :size="14"
                    class="shrink-0 text-warning"
                />
                <span
                    class="ml-auto whitespace-nowrap tabular-nums text-text-color group-hover:hidden group-focus-within:hidden"
                    :class="{ '!hidden': openTagRow === `custom-${sensor.channelName}` }"
                >
                    {{ liveValue(sensor) }}
                </span>
            </RouterLink>
            <div
                class="ml-auto hidden items-center gap-0.5 pr-1 group-hover:flex group-focus-within:flex"
                :class="{ '!flex': openTagRow === `custom-${sensor.channelName}` }"
            >
                <CCColorPicker
                    :model-value="sensorColor(sensor.deviceUID, sensor.channelName)"
                    :size="1.25"
                    @update:model-value="(c: Color) => setSensorColor(sensor, c)"
                />
                <TagPopover
                    :device-u-i-d="sensor.deviceUID"
                    :channel-name="sensor.channelName"
                    @open="(open: boolean) => onTagOpen(`custom-${sensor.channelName}`, open)"
                />
                <button
                    type="button"
                    class="rounded p-1 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                    :title="
                        isPinned(sensor)
                            ? t('layout.shell.coolingPanel.unpin')
                            : t('layout.shell.coolingPanel.pin')
                    "
                    @click.prevent="togglePin(sensor)"
                >
                    <svg-icon
                        type="mdi"
                        :path="isPinned(sensor) ? mdiPinOff : mdiPinOutline"
                        :size="16"
                    />
                </button>
            </div>
        </div>

        <UiSeparator class="my-1" />
        <div class="flex items-center justify-between px-2 pb-1 pt-2">
            <span class="flex items-center gap-1.5 text-xs uppercase text-text-color-secondary">
                {{ t('layout.menu.alerts') }}
                <span
                    v-if="activeAlertCount > 0"
                    class="rounded-full bg-error px-1.5 text-xs normal-case text-white"
                >
                    {{ activeAlertCount }}
                </span>
            </span>
            <button
                type="button"
                class="rounded p-0.5 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                :title="t('layout.menu.tooltips.addAlert')"
                @click="router.push({ name: 'monitoring-alert-new' })"
            >
                <svg-icon type="mdi" :path="mdiPlus" :size="16" />
            </button>
        </div>
        <RouterLink
            :to="{ name: 'monitoring-alerts' }"
            class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none hover:bg-surface-hover focus:ring-2 focus:ring-accent"
            exact-active-class="bg-surface-hover !text-accent"
        >
            <svg-icon
                type="mdi"
                :path="mdiBellOutline"
                :size="14"
                class="shrink-0 text-text-color-secondary"
            />
            <span class="truncate">{{ t('views.alerts.alertsOverview') }}</span>
        </RouterLink>
        <RouterLink
            v-for="alert in orderedAlerts"
            :key="alert.uid"
            :to="{ name: 'monitoring-alert', params: { alertUID: alert.uid } }"
            class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none hover:bg-surface-hover focus:ring-2 focus:ring-accent"
            exact-active-class="bg-surface-hover !text-accent"
        >
            <span
                class="h-2 w-2 shrink-0 rounded-full"
                :class="alert.state === AlertState.Active ? 'bg-error' : 'bg-success'"
            />
            <span class="truncate">{{ alert.name }}</span>
        </RouterLink>

        <UiSeparator class="my-1" />
        <template v-for="group in groups" :key="group.deviceUID">
            <div
                class="truncate px-2 pb-1 pt-2 text-xs uppercase"
                :class="{ 'text-text-color-secondary': !deviceColor(group.deviceUID) }"
                :style="deviceColor(group.deviceUID) ? { color: deviceColor(group.deviceUID) } : {}"
            >
                {{ deviceLabel(group.deviceUID) }}
            </div>
            <div
                v-for="sensor in group.sensors"
                :key="sensor.channelName"
                class="group flex items-center rounded-lg hover:bg-surface-hover focus-within:bg-surface-hover focus-within:ring-2 focus-within:ring-accent"
            >
                <RouterLink
                    :to="sensorRoute(sensor, false)"
                    class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none"
                    exact-active-class="!text-accent"
                >
                    <span
                        class="h-2 w-2 shrink-0 rounded-full"
                        :style="{
                            backgroundColor: sensorColor(sensor.deviceUID, sensor.channelName),
                        }"
                    />
                    <span class="truncate">
                        {{ sensorLabel(sensor.deviceUID, sensor.channelName) }}
                    </span>
                    <svg-icon
                        v-if="isUnhealthy(sensor.deviceUID, sensor.channelName)"
                        type="mdi"
                        :path="mdiAlert"
                        :size="14"
                        class="shrink-0 text-warning"
                    />
                    <span
                        class="ml-auto whitespace-nowrap tabular-nums text-text-color group-hover:hidden group-focus-within:hidden"
                        :class="{
                            '!hidden': openTagRow === `${sensor.deviceUID}-${sensor.channelName}`,
                        }"
                    >
                        {{ liveValue(sensor) }}
                    </span>
                </RouterLink>
                <div
                    class="ml-auto hidden items-center gap-0.5 pr-1 group-hover:flex group-focus-within:flex"
                    :class="{
                        '!flex': openTagRow === `${sensor.deviceUID}-${sensor.channelName}`,
                    }"
                >
                    <CCColorPicker
                        :model-value="sensorColor(sensor.deviceUID, sensor.channelName)"
                        :size="1.25"
                        @update:model-value="(c: Color) => setSensorColor(sensor, c)"
                    />
                    <TagPopover
                        :device-u-i-d="sensor.deviceUID"
                        :channel-name="sensor.channelName"
                        @open="
                            (open: boolean) =>
                                onTagOpen(`${sensor.deviceUID}-${sensor.channelName}`, open)
                        "
                    />
                    <button
                        type="button"
                        class="rounded p-1 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                        :title="
                            isPinned(sensor)
                                ? t('layout.shell.coolingPanel.unpin')
                                : t('layout.shell.coolingPanel.pin')
                        "
                        @click.prevent="togglePin(sensor)"
                    >
                        <svg-icon
                            type="mdi"
                            :path="isPinned(sensor) ? mdiPinOff : mdiPinOutline"
                            :size="16"
                        />
                    </button>
                </div>
            </div>
        </template>
    </div>
</template>
