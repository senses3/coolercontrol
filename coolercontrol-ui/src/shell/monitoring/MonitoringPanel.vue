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
    mdiBellOffOutline,
    mdiBellOutline,
    mdiBellPlusOutline,
    mdiBellRingOutline,
    mdiBellSleepOutline,
    mdiDragVertical,
    mdiFanAlert,
    mdiHome,
    mdiPinOff,
    mdiPinOutline,
    mdiPlus,
    mdiViewDashboardOutline,
} from '@mdi/js'
import { VueDraggable } from 'vue-draggable-plus'
import { DropdownMenuItem } from 'reka-ui'
import UiDropdownMenu from '@/shell/ui/UiDropdownMenu.vue'
import { dropdownItemClass } from '@/shell/ui/dropdownItemClass.ts'
import { storeToRefs } from 'pinia'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import type { Color, Device, UID } from '@/models/Device.ts'
import { Dashboard } from '@/models/Dashboard.ts'
import { Alert, alertIsSilenced, AlertState } from '@/models/Alert.ts'
import { ChannelMetric } from '@/models/ChannelSource.ts'
import CCColorPicker from '@/components/CCColorPicker.vue'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { pinId } from '@/shell/cooling/channels.ts'
import {
    orderedByGroup,
    reorderSubset,
    setDeviceChildrenSubset,
    setGroupOrder,
} from '@/shell/panelOrder.ts'
import { monitoringSensors, type MonitoringSensor } from '@/shell/monitoring/sensors.ts'
import { channelKind, channelKindIcon, channelSpins } from '@/shell/channelIcon.ts'
import PanelHeader from '@/shell/PanelHeader.vue'
import TagPopover from '@/shell/monitoring/TagPopover.vue'
import TagChips from '@/shell/TagChips.vue'
import UiTooltip from '@/shell/ui/UiTooltip.vue'
import UiSeparator from '@/shell/ui/UiSeparator.vue'

const { t } = useI18n()
const router = useRouter()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const { currentDeviceStatus } = storeToRefs(deviceStore)

// Mutable copies so rows are drag-sortable; rebuilt when devices change.
const groups = ref<ReturnType<typeof monitoringSensors>>([])
watchEffect(() => {
    groups.value = monitoringSensors(deviceStore.allDevices())
})
watchEffect(() => {})

const allChannelIds = (deviceUID: UID): string[] => {
    const device = [...deviceStore.allDevices()].find((dev) => dev.uid === deviceUID)
    if (device?.info == null) return []
    const ids = [...device.info.temps.keys(), ...device.info.channels.keys()]
    return ids.map((name) => pinId(deviceUID, name))
}

const persistSensorOrder = (group: { deviceUID: UID; sensors: MonitoringSensor[] }): void => {
    settingsStore.menuOrder = setDeviceChildrenSubset(
        settingsStore.menuOrder,
        group.deviceUID,
        group.sensors.map((sensor) => pinId(sensor.deviceUID, sensor.channelName)),
        allChannelIds(group.deviceUID),
    )
    deviceStore.reSortDevicesByMenuOrder()
}

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

const devicesByUid = computed(() => {
    const map = new Map<UID, Device>()
    for (const device of deviceStore.allDevices()) map.set(device.uid, device)
    return map
})
const sensorValues = (sensor: MonitoringSensor) =>
    currentDeviceStatus.value.get(sensor.deviceUID)?.get(sensor.channelName)
const sensorIcon = (sensor: MonitoringSensor): string =>
    channelKindIcon(
        channelKind(
            devicesByUid.value.get(sensor.deviceUID),
            sensor.channelName,
            sensorValues(sensor),
        ),
    )
const sensorSpins = (sensor: MonitoringSensor): boolean => {
    const values = sensorValues(sensor)
    return channelSpins(
        channelKind(devicesByUid.value.get(sensor.deviceUID), sensor.channelName, values),
        values,
        settingsStore.eyeCandy,
    )
}

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

const failsafeTooltip = (deviceUID: UID, channelName?: string): string => {
    const ref = settingsStore.healthFailsafe.find(
        (entry) =>
            entry.device_uid === deviceUID && (channelName == null || entry.name === channelName),
    )
    const base = t('views.appInfo.failsafeActive')
    return ref?.reason ? `${base}: ${ref.reason}` : base
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

// Alert convenience: temp sensors get a plain new-alert button; fan channels
// (those reporting rpm) get a "fail alert" prefilled to catch 0 rpm; other
// value types (duty/load/watts/freq) get no button.
type AlertKind = 'temp' | 'fan'
const alertKind = (sensor: MonitoringSensor): AlertKind | null => {
    if (sensor.isTemp) return 'temp'
    const values = currentDeviceStatus.value.get(sensor.deviceUID)?.get(sensor.channelName)
    return values?.rpm != null ? 'fan' : null
}
const createAlert = (sensor: MonitoringSensor): void => {
    const kind = alertKind(sensor)
    if (kind == null) return
    const query: Record<string, string> = {
        device: sensor.deviceUID,
        channel: sensor.channelName,
    }
    if (kind === 'fan') {
        query.metric = ChannelMetric.RPM
        // Alert when the fan drops to 0 rpm; the upper bound is effectively
        // open (the editor's RPM ceiling, above any real fan).
        query.min = '1'
        query.max = '30000'
        query.name = `${sensorLabel(sensor.deviceUID, sensor.channelName)} ${t('layout.shell.monitoringPanel.failAlertSuffix')}`
    } else {
        query.metric = ChannelMetric.Temp
    }
    router.push({ name: 'monitoring-alert-new', query })
}

const isDashboardPinned = (dashboard: Dashboard): boolean =>
    settingsStore.pinnedIds.includes(dashboard.uid)

const toggleDashboardPin = (dashboard: Dashboard): void =>
    void (settingsStore.pinnedIds = settingsStore.pinnedIds.includes(dashboard.uid)
        ? settingsStore.pinnedIds.filter((pinned) => pinned !== dashboard.uid)
        : [...settingsStore.pinnedIds, dashboard.uid])

const pinnedSensors = ref<MonitoringSensor[]>([])
watchEffect(() => {
    const sensors = groups.value
        .flatMap((group) => group.sensors)
        .filter((sensor) => isPinned(sensor))
    const order = settingsStore.pinnedIds
    sensors.sort(
        (a, b) =>
            order.indexOf(pinId(a.deviceUID, a.channelName)) -
            order.indexOf(pinId(b.deviceUID, b.channelName)),
    )
    pinnedSensors.value = sensors
})
const pinnedDashboards = ref<Dashboard[]>([])
watchEffect(() => {
    const order = settingsStore.pinnedIds
    pinnedDashboards.value = settingsStore.dashboards
        .filter((dashboard) => isDashboardPinned(dashboard))
        .sort((a, b) => order.indexOf(a.uid) - order.indexOf(b.uid))
})
const persistPinnedSensorOrder = (): void => {
    settingsStore.pinnedIds = reorderSubset(
        settingsStore.pinnedIds,
        pinnedSensors.value.map((sensor) => pinId(sensor.deviceUID, sensor.channelName)),
    )
}
const persistPinnedDashboardOrder = (): void => {
    settingsStore.pinnedIds = reorderSubset(
        settingsStore.pinnedIds,
        pinnedDashboards.value.map((dashboard) => dashboard.uid),
    )
}

const setSensorColor = (sensor: MonitoringSensor, newColor: Color): void => {
    const setting = settingsStore.allUIDeviceSettings
        .get(sensor.deviceUID)
        ?.sensorsAndChannels.get(sensor.channelName)
    if (setting != null) setting.userColor = newColor
}
const sensorDefaultColor = (deviceUID: UID, channelName: string): Color | undefined =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.sensorsAndChannels.get(channelName)
        ?.defaultColor
// Reset clears the user override so the non-user-defined color applies again.
const resetSensorColor = (sensor: MonitoringSensor): void => {
    const setting = settingsStore.allUIDeviceSettings
        .get(sensor.deviceUID)
        ?.sensorsAndChannels.get(sensor.channelName)
    if (setting != null) setting.userColor = undefined
}

// Explicit drag order wins; otherwise home dashboard first, then store order.
const orderedDashboards = ref<Dashboard[]>([])
watchEffect(() => {
    const entry = settingsStore.menuOrder.find((item) => item.id === 'dashboards')
    if (entry?.children?.length) {
        orderedDashboards.value = orderedByGroup(
            settingsStore.menuOrder,
            'dashboards',
            [...settingsStore.dashboards],
            (dashboard) => dashboard.uid,
        )
        return
    }
    orderedDashboards.value = [...settingsStore.dashboards].sort((a, b) => {
        if (a.uid === settingsStore.homeDashboard) return -1
        if (b.uid === settingsStore.homeDashboard) return 1
        return 0
    })
})
const persistDashboardOrder = (): void => {
    settingsStore.menuOrder = setGroupOrder(
        settingsStore.menuOrder,
        'dashboards',
        orderedDashboards.value.map((dashboard) => dashboard.uid),
    )
}

const addDashboard = (): void => {
    const dashboard = new Dashboard(t('layout.shell.monitoringPanel.newDashboard'))
    settingsStore.dashboards.push(dashboard)
    router.push({ name: 'monitoring-dashboard', params: { dashboardUID: dashboard.uid } })
}

const orderedAlerts = ref<typeof settingsStore.alerts>([])
watchEffect(() => {
    orderedAlerts.value = orderedByGroup(
        settingsStore.menuOrder,
        'alerts',
        [...settingsStore.alerts],
        (alert) => alert.uid,
    )
})
const persistAlertOrder = (): void => {
    settingsStore.menuOrder = setGroupOrder(
        settingsStore.menuOrder,
        'alerts',
        orderedAlerts.value.map((alert) => alert.uid),
    )
}
const activeAlertCount = computed(
    () => settingsStore.alerts.filter((alert) => alert.state === AlertState.Active).length,
)
// Menu glyph: shape encodes silenced/disabled, color keeps the live state
// (silenced alerts still evaluate; a red sleep bell means firing-but-muted).
const alertMenuIcon = (alert: Alert): string => {
    if (!alert.enabled) return mdiBellOffOutline
    if (alertIsSilenced(alert)) return mdiBellSleepOutline
    return alert.state === AlertState.Active ? mdiBellRingOutline : mdiBellOutline
}
const alertMenuIconClass = (alert: Alert): string => {
    if (!alert.enabled) return 'text-text-color-secondary'
    return alert.state === AlertState.Active ? 'text-error' : 'text-success'
}
// Keeps a row's hover actions rendered while its silence menu is open: the
// modal menu suppresses :hover, and a hidden trigger cannot anchor the menu.
const openAlertMenuUid = ref<UID | null>(null)
// Hover quick actions: silence and enable act on the saved alert directly.
const silenceAlert = async (alert: Alert, minutes: number): Promise<void> => {
    alert.silenced_until = new Date(Date.now() + minutes * 60_000).toISOString()
    await settingsStore.updateAlert(alert.uid)
}
const unsilenceAlert = async (alert: Alert): Promise<void> => {
    alert.silenced_until = undefined
    await settingsStore.updateAlert(alert.uid)
}
const toggleAlertEnabled = async (alert: Alert): Promise<void> => {
    alert.enabled = !alert.enabled
    await settingsStore.updateAlert(alert.uid)
}

// Keeps a row's hover actions visible while its tag popover is open.
const openTagRow = ref<string | null>(null)
const onTagOpen = (rowKey: string, open: boolean): void => {
    openTagRow.value = open ? rowKey : null
}

const sensorRoute = (sensor: MonitoringSensor) => ({
    name: 'monitoring-sensor',
    params: { deviceUID: sensor.deviceUID, channelName: sensor.channelName },
})
</script>

<template>
    <div class="flex flex-col gap-0.5 p-2 pb-24 text-base">
        <template v-if="pinnedDashboards.length > 0 || pinnedSensors.length > 0">
            <PanelHeader :label="t('layout.menu.pinned')" />
            <VueDraggable
                v-model="pinnedDashboards"
                handle=".drag-handle"
                :animation="150"
                class="flex flex-col gap-0.5"
                @end="persistPinnedDashboardOrder"
            >
                <div
                    v-for="dashboard in pinnedDashboards"
                    :key="`pin-${dashboard.uid}`"
                    class="group flex items-center rounded-lg hover:bg-surface-hover has-[:focus-visible]:bg-surface-hover has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
                >
                    <RouterLink
                        :to="{
                            name: 'monitoring-dashboard',
                            params: { dashboardUID: dashboard.uid },
                        }"
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
                        class="ml-auto hidden items-center gap-0.5 pr-1 group-hover:flex group-has-[:focus-visible]:flex group-has-[[data-state=open]]:flex"
                    >
                        <span class="drag-handle cursor-grab p-1 text-text-color-secondary">
                            <svg-icon type="mdi" :path="mdiDragVertical" :size="16" />
                        </span>
                        <button
                            type="button"
                            class="rounded p-1 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                            v-tooltip.top="t('layout.shell.coolingPanel.unpin')"
                            @click.prevent="toggleDashboardPin(dashboard)"
                        >
                            <svg-icon type="mdi" :path="mdiPinOff" :size="16" />
                        </button>
                    </div>
                </div>
            </VueDraggable>
            <VueDraggable
                v-model="pinnedSensors"
                handle=".drag-handle"
                :animation="150"
                class="flex flex-col gap-0.5"
                @end="persistPinnedSensorOrder"
            >
                <div
                    v-for="sensor in pinnedSensors"
                    :key="`pin-${sensor.deviceUID}-${sensor.channelName}`"
                    class="group flex items-center rounded-lg hover:bg-surface-hover has-[:focus-visible]:bg-surface-hover has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
                >
                    <RouterLink
                        :to="sensorRoute(sensor)"
                        class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none"
                        exact-active-class="!text-accent"
                    >
                        <svg-icon
                            type="mdi"
                            :path="sensorIcon(sensor)"
                            :size="14"
                            class="shrink-0"
                            :class="{ 'animate-spin-slow': sensorSpins(sensor) }"
                            :style="{
                                color:
                                    sensorColor(sensor.deviceUID, sensor.channelName) || undefined,
                            }"
                        />
                        <span class="truncate">
                            {{ sensorLabel(sensor.deviceUID, sensor.channelName) }}
                        </span>
                        <TagChips
                            :device-u-i-d="sensor.deviceUID"
                            :channel-name="sensor.channelName"
                        />
                        <!-- Huge shrink so the device name fully collapses before
                             the channel name (truncate, shrink-1) gives up any space. -->
                        <span class="shrink-[9999] truncate text-xs text-text-color-secondary">
                            {{ deviceLabel(sensor.deviceUID) }}
                        </span>
                        <span
                            class="ml-auto whitespace-nowrap tabular-nums text-text-color group-hover:hidden group-has-[:focus-visible]:hidden"
                            :class="{
                                '!hidden':
                                    openTagRow === `pin-${sensor.deviceUID}-${sensor.channelName}`,
                            }"
                        >
                            {{ liveValue(sensor) }}
                        </span>
                    </RouterLink>
                    <div
                        class="ml-auto hidden items-center gap-0.5 pr-1 group-hover:flex group-has-[:focus-visible]:flex group-has-[[data-state=open]]:flex"
                        :class="{
                            '!flex': openTagRow === `pin-${sensor.deviceUID}-${sensor.channelName}`,
                        }"
                    >
                        <span class="drag-handle cursor-grab p-1 text-text-color-secondary">
                            <svg-icon type="mdi" :path="mdiDragVertical" :size="16" />
                        </span>
                        <CCColorPicker
                            :model-value="sensorColor(sensor.deviceUID, sensor.channelName)"
                            :default-color="
                                sensorDefaultColor(sensor.deviceUID, sensor.channelName)
                            "
                            :size="1.25"
                            @update:model-value="(c: Color) => setSensorColor(sensor, c)"
                            @reset="resetSensorColor(sensor)"
                        />
                        <TagPopover
                            :device-u-i-d="sensor.deviceUID"
                            :channel-name="sensor.channelName"
                            @open="
                                (open: boolean) =>
                                    onTagOpen(`pin-${sensor.deviceUID}-${sensor.channelName}`, open)
                            "
                        />
                        <button
                            v-if="alertKind(sensor) != null"
                            type="button"
                            class="rounded p-1 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                            v-tooltip.top="
                                alertKind(sensor) === 'fan'
                                    ? t('layout.shell.monitoringPanel.failAlert')
                                    : t('layout.shell.monitoringPanel.createAlert')
                            "
                            @click.prevent="createAlert(sensor)"
                        >
                            <svg-icon
                                type="mdi"
                                :path="
                                    alertKind(sensor) === 'fan' ? mdiFanAlert : mdiBellPlusOutline
                                "
                                :size="16"
                            />
                        </button>
                        <button
                            type="button"
                            class="rounded p-1 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                            v-tooltip.top="t('layout.shell.coolingPanel.unpin')"
                            @click.prevent="togglePin(sensor)"
                        >
                            <svg-icon type="mdi" :path="mdiPinOff" :size="16" />
                        </button>
                    </div>
                </div>
            </VueDraggable>
            <UiSeparator class="my-1" />
        </template>

        <PanelHeader :label="t('layout.menu.dashboards')">
            <button
                type="button"
                class="rounded p-0.5 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                v-tooltip.top="t('layout.menu.tooltips.addDashboard')"
                @click="addDashboard"
            >
                <svg-icon type="mdi" :path="mdiPlus" :size="16" />
            </button>
        </PanelHeader>
        <VueDraggable
            v-model="orderedDashboards"
            handle=".drag-handle"
            :animation="150"
            class="flex flex-col gap-0.5"
            @end="persistDashboardOrder"
        >
            <div
                v-for="dashboard in orderedDashboards"
                :key="dashboard.uid"
                class="group flex items-center rounded-lg hover:bg-surface-hover has-[:focus-visible]:bg-surface-hover has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
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
                        v-tooltip.top="t('views.dashboard.setAsHome')"
                    />
                </RouterLink>
                <div
                    class="ml-auto hidden items-center gap-0.5 pr-1 group-hover:flex group-has-[:focus-visible]:flex group-has-[[data-state=open]]:flex"
                >
                    <span class="drag-handle cursor-grab p-1 text-text-color-secondary">
                        <svg-icon type="mdi" :path="mdiDragVertical" :size="16" />
                    </span>
                    <button
                        type="button"
                        class="rounded p-1 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                        v-tooltip.top="
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
        </VueDraggable>
        <UiSeparator class="my-1" />
        <PanelHeader>
            <template #label>
                {{ t('layout.menu.alerts') }}
                <span
                    v-if="activeAlertCount > 0"
                    class="rounded-full bg-error px-1.5 text-xs normal-case text-white"
                >
                    {{ activeAlertCount }}
                </span>
            </template>
            <button
                type="button"
                class="rounded p-0.5 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                v-tooltip.top="t('layout.menu.tooltips.addAlert')"
                @click="router.push({ name: 'monitoring-alert-new' })"
            >
                <svg-icon type="mdi" :path="mdiPlus" :size="16" />
            </button>
        </PanelHeader>
        <RouterLink
            :to="{ name: 'monitoring-alerts' }"
            class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
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
        <VueDraggable
            v-model="orderedAlerts"
            handle=".drag-handle"
            :animation="150"
            class="flex flex-col gap-0.5"
            @end="persistAlertOrder"
        >
            <RouterLink
                v-for="alert in orderedAlerts"
                :key="alert.uid"
                :to="{ name: 'monitoring-alert', params: { alertUID: alert.uid } }"
                class="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
                exact-active-class="bg-surface-hover !text-accent"
            >
                <svg-icon
                    type="mdi"
                    :path="alertMenuIcon(alert)"
                    :size="14"
                    class="shrink-0"
                    :class="alertMenuIconClass(alert)"
                />
                <span class="truncate">{{ alert.name }}</span>
                <span
                    class="ml-auto items-center gap-0.5"
                    :class="
                        openAlertMenuUid === alert.uid
                            ? 'inline-flex'
                            : 'hidden group-hover:inline-flex'
                    "
                    @click.prevent.stop
                >
                    <UiDropdownMenu
                        v-if="alert.enabled"
                        @update:open="(open) => (openAlertMenuUid = open ? alert.uid : null)"
                    >
                        <template #trigger>
                            <button
                                type="button"
                                class="rounded p-0.5 text-text-color-secondary hover:text-text-color"
                                v-tooltip.top="t('views.alerts.silenceTooltip')"
                            >
                                <svg-icon type="mdi" :path="mdiBellSleepOutline" :size="14" />
                            </button>
                        </template>
                        <DropdownMenuItem
                            :class="dropdownItemClass"
                            @select="silenceAlert(alert, 15)"
                        >
                            {{ t('views.alerts.silence15m') }}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            :class="dropdownItemClass"
                            @select="silenceAlert(alert, 60)"
                        >
                            {{ t('views.alerts.silence1h') }}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            :class="dropdownItemClass"
                            @select="silenceAlert(alert, 480)"
                        >
                            {{ t('views.alerts.silence8h') }}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            :class="dropdownItemClass"
                            @select="silenceAlert(alert, 1440)"
                        >
                            {{ t('views.alerts.silence24h') }}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            v-if="alertIsSilenced(alert)"
                            :class="dropdownItemClass"
                            @select="unsilenceAlert(alert)"
                        >
                            {{ t('views.alerts.unsilence') }}
                        </DropdownMenuItem>
                    </UiDropdownMenu>
                    <button
                        type="button"
                        class="rounded p-0.5 text-text-color-secondary hover:text-text-color"
                        v-tooltip.top="
                            alert.enabled
                                ? t('views.alerts.disableAlert')
                                : t('views.alerts.enableAlert')
                        "
                        @click="toggleAlertEnabled(alert)"
                    >
                        <svg-icon
                            type="mdi"
                            :path="alert.enabled ? mdiBellOffOutline : mdiBellOutline"
                            :size="14"
                        />
                    </button>
                </span>
                <span
                    class="drag-handle hidden cursor-grab p-0.5 text-text-color-secondary group-hover:inline-flex"
                >
                    <svg-icon type="mdi" :path="mdiDragVertical" :size="14" />
                </span>
            </RouterLink>
        </VueDraggable>
        <UiSeparator class="my-1" />
        <template v-for="group in groups" :key="group.deviceUID">
            <PanelHeader
                :label="deviceLabel(group.deviceUID)"
                :color="deviceColor(group.deviceUID) || 'rgb(var(--colors-text-color))'"
            />
            <VueDraggable
                v-model="group.sensors"
                handle=".drag-handle"
                :animation="150"
                class="flex flex-col gap-0.5"
                @end="persistSensorOrder(group)"
            >
                <div
                    v-for="sensor in group.sensors"
                    :key="sensor.channelName"
                    class="group flex items-center rounded-lg hover:bg-surface-hover has-[:focus-visible]:bg-surface-hover has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
                >
                    <RouterLink
                        :to="sensorRoute(sensor)"
                        class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none"
                        exact-active-class="!text-accent"
                    >
                        <svg-icon
                            type="mdi"
                            :path="sensorIcon(sensor)"
                            :size="14"
                            class="shrink-0"
                            :class="{ 'animate-spin-slow': sensorSpins(sensor) }"
                            :style="{
                                color:
                                    sensorColor(sensor.deviceUID, sensor.channelName) || undefined,
                            }"
                        />
                        <span class="truncate">
                            {{ sensorLabel(sensor.deviceUID, sensor.channelName) }}
                        </span>
                        <TagChips
                            :device-u-i-d="sensor.deviceUID"
                            :channel-name="sensor.channelName"
                        />
                        <UiTooltip
                            v-if="isUnhealthy(sensor.deviceUID, sensor.channelName)"
                            :text="failsafeTooltip(sensor.deviceUID, sensor.channelName)"
                        >
                            <svg-icon
                                type="mdi"
                                :path="mdiAlert"
                                :size="14"
                                class="shrink-0 text-error"
                            />
                        </UiTooltip>
                        <span
                            class="ml-auto whitespace-nowrap tabular-nums text-text-color group-hover:hidden group-has-[:focus-visible]:hidden"
                            :class="{
                                '!hidden':
                                    openTagRow === `${sensor.deviceUID}-${sensor.channelName}`,
                            }"
                        >
                            {{ liveValue(sensor) }}
                        </span>
                    </RouterLink>
                    <div
                        class="ml-auto hidden items-center gap-0.5 pr-1 group-hover:flex group-has-[:focus-visible]:flex group-has-[[data-state=open]]:flex"
                        :class="{
                            '!flex': openTagRow === `${sensor.deviceUID}-${sensor.channelName}`,
                        }"
                    >
                        <span class="drag-handle cursor-grab p-1 text-text-color-secondary">
                            <svg-icon type="mdi" :path="mdiDragVertical" :size="16" />
                        </span>
                        <CCColorPicker
                            :model-value="sensorColor(sensor.deviceUID, sensor.channelName)"
                            :default-color="
                                sensorDefaultColor(sensor.deviceUID, sensor.channelName)
                            "
                            :size="1.25"
                            @update:model-value="(c: Color) => setSensorColor(sensor, c)"
                            @reset="resetSensorColor(sensor)"
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
                            v-if="alertKind(sensor) != null"
                            type="button"
                            class="rounded p-1 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                            v-tooltip.top="
                                alertKind(sensor) === 'fan'
                                    ? t('layout.shell.monitoringPanel.failAlert')
                                    : t('layout.shell.monitoringPanel.createAlert')
                            "
                            @click.prevent="createAlert(sensor)"
                        >
                            <svg-icon
                                type="mdi"
                                :path="
                                    alertKind(sensor) === 'fan' ? mdiFanAlert : mdiBellPlusOutline
                                "
                                :size="16"
                            />
                        </button>
                        <button
                            type="button"
                            class="rounded p-1 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                            v-tooltip.top="
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
            </VueDraggable>
        </template>
    </div>
</template>
