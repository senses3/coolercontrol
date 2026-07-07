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
import SvgIcon from '@jamescoyle/vue-icon'
import {
    mdiBellPlusOutline,
    mdiChevronDown,
    mdiChevronUp,
    mdiMinusThick,
    mdiMonitor,
    mdiPageFirst,
    mdiPageLast,
    mdiChevronLeft,
    mdiChevronRight,
    mdiPower,
    mdiVolumeHigh,
} from '@mdi/js'
import { ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from 'reka-ui'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { Alert, AlertState, getAlertStateDisplayName, getAlertStateIcon } from '@/models/Alert.ts'
import { ChannelMetric, getChannelMetricDisplayName } from '@/models/ChannelSource.ts'
import UiTag from '@/shell/ui/UiTag.vue'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { computed, ref, watch } from 'vue'
import UiButton from '@/shell/ui/UiButton.vue'
import UiInput from '@/shell/ui/UiInput.vue'
import UiSelect from '@/shell/ui/UiSelect.vue'
import UiTable from '@/shell/ui/UiTable.vue'

const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const { getREMSize } = useDeviceStore()
const router = useRouter()
const { t } = useI18n()

const alertsList = computed(() => {
    const alerts = []
    for (const alert of settingsStore.alerts) {
        alerts.push(alert)
    }
    const alertMenuOrder = settingsStore.menuOrder.find((item) => item.id === 'alerts')
    if (alertMenuOrder?.children?.length) {
        const getIndex = (item: any) => {
            const index = alertMenuOrder.children.indexOf(item.uid)
            return index >= 0 ? index : Number.MAX_SAFE_INTEGER
        }
        alerts.sort((a: any, b: any) => getIndex(a) - getIndex(b))
    }
    return alerts
})
const onRowSelect = (alertUID: string) => {
    router.push({ name: 'monitoring-alert', params: { alertUID } })
}

// Card grid: alerts needing attention first, then the panel's menu order.
const sortedAlerts = computed(() => {
    const rank = (alert: Alert): number =>
        alert.state === AlertState.Active ? 0 : alert.state === AlertState.Error ? 1 : 2
    return [...alertsList.value].sort((a, b) => rank(a) - rank(b))
})
const tagSeverity = (state?: AlertState): 'danger' | 'warn' | 'success' =>
    state === AlertState.Active ? 'danger' : state === AlertState.Error ? 'warn' : 'success'
const sourceChannel = (alert: Alert) =>
    settingsStore.allUIDeviceSettings
        .get(alert.channel_source.device_uid)
        ?.sensorsAndChannels.get(alert.channel_source.channel_name)
const sourceLabel = (alert: Alert): string =>
    sourceChannel(alert)?.name ?? alert.channel_source.channel_name
const sourceColor = (alert: Alert): string =>
    sourceChannel(alert)?.color ?? 'rgb(var(--colors-text-color-secondary))'
const valueSuffix = (metric: ChannelMetric): string => {
    switch (metric) {
        case ChannelMetric.Duty:
        case ChannelMetric.Load:
            return ` ${t('common.percentUnit')}`
        case ChannelMetric.RPM:
            return ` ${t('common.rpmAbbr')}`
        case ChannelMetric.Freq:
            return ` ${t('common.mhzAbbr')}`
        default:
            return ` ${t('common.tempUnit')}`
    }
}
const liveValue = (alert: Alert): string => {
    const values = deviceStore.currentDeviceStatus
        .get(alert.channel_source.device_uid)
        ?.get(alert.channel_source.channel_name)
    if (values == null) return ''
    switch (alert.channel_source.channel_metric) {
        case ChannelMetric.Duty:
        case ChannelMetric.Load:
            return values.duty ?? ''
        case ChannelMetric.RPM:
            return values.rpm ?? ''
        case ChannelMetric.Freq:
            return values.freq ?? ''
        default:
            return values.temp ?? ''
    }
}
// Latest log entry per alert: the moment it entered its current state.
const lastLogTimes = computed(() => {
    const latest = new Map<string, string>()
    for (const log of settingsStore.alertLogs) {
        const existing = latest.get(log.uid)
        if (existing == null || new Date(log.timestamp) > new Date(existing)) {
            latest.set(log.uid, log.timestamp)
        }
    }
    return latest
})

// Alert log listing: newest first by default, searchable, paged.
const logSearch = ref('')
const logSortAsc = ref(false)
const logPage = ref(1)
const logRows = ref('20')
const logRowsOptions = ['20', '50', '100'].map((n) => ({ label: n, value: n }))
const filteredLogs = computed(() => {
    const needle = logSearch.value.trim().toLowerCase()
    const logs = needle
        ? settingsStore.alertLogs.filter(
              (log) =>
                  log.name.toLowerCase().includes(needle) ||
                  log.message.toLowerCase().includes(needle),
          )
        : [...settingsStore.alertLogs]
    logs.sort((a, b) =>
        logSortAsc.value
            ? new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            : new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    return logs
})
const logPageCount = computed(() =>
    Math.max(1, Math.ceil(filteredLogs.value.length / Number(logRows.value))),
)
const pagedLogs = computed(() => {
    const rows = Number(logRows.value)
    const page = Math.min(logPage.value, logPageCount.value)
    return filteredLogs.value.slice((page - 1) * rows, page * rows)
})
watch([logSearch, logRows], () => {
    logPage.value = 1
})
</script>

<template>
    <div class="flex flex-wrap items-center gap-3 px-4 pt-4">
        <h1 class="text-xl font-semibold text-text-color">
            {{ t('views.alerts.alertsOverview') }}
        </h1>
    </div>
    <ScrollAreaRoot style="--scrollbar-size: 10px">
        <ScrollAreaViewport class="p-4 pb-16 h-screen w-full">
            <div class="mt-8 flex flex-col">
                <span class="pb-3 ml-1 font-semibold text-xl text-text-color">{{
                    t('layout.topbar.alerts')
                }}</span>
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    <div
                        v-for="alert in sortedAlerts"
                        :key="alert.uid"
                        class="flex cursor-pointer flex-col gap-2 rounded-lg border bg-bg-two p-4 hover:bg-surface-hover"
                        :class="
                            alert.state === AlertState.Active || alert.state === AlertState.Error
                                ? 'border-error'
                                : 'border-border-one'
                        "
                        @click="onRowSelect(alert.uid)"
                    >
                        <div class="flex items-center gap-2">
                            <svg-icon
                                type="mdi"
                                class="shrink-0"
                                :class="{ 'text-error': alert.state === AlertState.Active }"
                                :path="getAlertStateIcon(alert.state!)"
                                :size="getREMSize(1.5)"
                            />
                            <span class="truncate text-base font-semibold text-text-color">
                                {{ alert.name }}
                            </span>
                            <UiTag
                                class="ml-auto shrink-0"
                                :value="getAlertStateDisplayName(alert.state!)"
                                :severity="tagSeverity(alert.state)"
                            />
                        </div>
                        <div class="flex items-center gap-2 text-base text-text-color">
                            <svg-icon
                                type="mdi"
                                :path="mdiMinusThick"
                                :size="14"
                                class="shrink-0"
                                :style="{ color: sourceColor(alert) }"
                            />
                            <span class="truncate">{{ sourceLabel(alert) }}</span>
                            <span class="shrink-0 text-text-color-secondary">
                                {{
                                    getChannelMetricDisplayName(alert.channel_source.channel_metric)
                                }}
                            </span>
                        </div>
                        <div class="text-sm text-text-color-secondary">
                            {{
                                t('views.alerts.range', {
                                    min: alert.min,
                                    max: alert.max,
                                    unit: valueSuffix(alert.channel_source.channel_metric),
                                })
                            }}
                            <template v-if="liveValue(alert) !== ''">
                                <br />
                                {{ t('components.sensorTable.current') }}: {{ liveValue(alert)
                                }}{{ valueSuffix(alert.channel_source.channel_metric) }}
                            </template>
                        </div>
                        <div
                            class="mt-auto flex items-center gap-2 text-sm text-text-color-secondary"
                        >
                            <span v-if="lastLogTimes.get(alert.uid) != null" class="truncate">
                                {{
                                    t('views.alerts.since', {
                                        time: new Date(
                                            lastLogTimes.get(alert.uid)!,
                                        ).toLocaleString(),
                                    })
                                }}
                            </span>
                            <span class="ml-auto flex shrink-0 items-center gap-1.5">
                                <svg-icon
                                    v-if="alert.desktop_notify"
                                    type="mdi"
                                    :path="mdiMonitor"
                                    :size="14"
                                    v-tooltip.top="t('views.alerts.desktopNotify')"
                                />
                                <svg-icon
                                    v-if="alert.desktop_notify_audio"
                                    type="mdi"
                                    :path="mdiVolumeHigh"
                                    :size="14"
                                    v-tooltip.top="t('views.alerts.desktopNotifyAudio')"
                                />
                                <svg-icon
                                    v-if="alert.shutdown_on_activation"
                                    type="mdi"
                                    class="text-error"
                                    :path="mdiPower"
                                    :size="14"
                                    v-tooltip.top="t('views.alerts.shutdownOnActivation')"
                                />
                            </span>
                        </div>
                    </div>
                    <div
                        class="flex min-h-[8rem] cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border-one p-4 text-text-color-secondary hover:bg-surface-hover hover:text-text-color"
                        @click="router.push({ name: 'monitoring-alert-new' })"
                    >
                        <svg-icon type="mdi" :path="mdiBellPlusOutline" :size="20" />
                        {{ t('views.alerts.newAlert') }}
                    </div>
                </div>
            </div>
            <div class="mt-8 flex flex-col">
                <span class="pb-3 ml-1 font-semibold text-xl text-text-color">{{
                    t('views.alerts.alertLogs')
                }}</span>
                <UiTable bordered class="w-full">
                    <template #toolbar>
                        <div
                            class="flex flex-wrap items-center justify-between gap-2 border-b border-border-one bg-bg-two p-2"
                        >
                            <UiInput v-model="logSearch" :placeholder="t('common.search')" />
                            <div class="flex items-center gap-1">
                                <UiButton
                                    variant="ghost"
                                    size="icon"
                                    :disabled="logPage <= 1"
                                    @click="logPage = 1"
                                >
                                    <svg-icon type="mdi" :path="mdiPageFirst" :size="18" />
                                </UiButton>
                                <UiButton
                                    variant="ghost"
                                    size="icon"
                                    :disabled="logPage <= 1"
                                    @click="logPage -= 1"
                                >
                                    <svg-icon type="mdi" :path="mdiChevronLeft" :size="18" />
                                </UiButton>
                                <span class="px-2 text-text-color-secondary">
                                    {{ Math.min(logPage, logPageCount) }} / {{ logPageCount }}
                                </span>
                                <UiButton
                                    variant="ghost"
                                    size="icon"
                                    :disabled="logPage >= logPageCount"
                                    @click="logPage += 1"
                                >
                                    <svg-icon type="mdi" :path="mdiChevronRight" :size="18" />
                                </UiButton>
                                <UiButton
                                    variant="ghost"
                                    size="icon"
                                    :disabled="logPage >= logPageCount"
                                    @click="logPage = logPageCount"
                                >
                                    <svg-icon type="mdi" :path="mdiPageLast" :size="18" />
                                </UiButton>
                                <UiSelect
                                    v-model="logRows"
                                    :options="logRowsOptions"
                                    class="!min-w-24"
                                />
                            </div>
                        </div>
                    </template>
                    <template #head>
                        <tr>
                            <th
                                class="cursor-pointer select-none hover:bg-surface-hover"
                                @click="logSortAsc = !logSortAsc"
                            >
                                <span class="inline-flex items-center gap-1">
                                    {{ t('common.timestamp') }}
                                    <svg-icon
                                        type="mdi"
                                        :path="logSortAsc ? mdiChevronUp : mdiChevronDown"
                                        :size="16"
                                    />
                                </span>
                            </th>
                            <th>{{ t('common.state') }}</th>
                            <th>{{ t('common.name') }}</th>
                            <th class="w-full">{{ t('common.message') }}</th>
                        </tr>
                    </template>
                    <tr
                        v-for="(log, index) in pagedLogs"
                        :key="`${log.uid}-${log.timestamp}-${index}`"
                        class="cursor-pointer hover:bg-surface-hover"
                        @click="onRowSelect(log.uid)"
                    >
                        <td class="whitespace-nowrap">
                            {{ new Date(log.timestamp).toLocaleString() }}
                        </td>
                        <td>
                            <span
                                class="underline"
                                :class="{
                                    'text-error': log.state === AlertState.Active,
                                    'text-success': log.state === AlertState.Inactive,
                                }"
                            >
                                {{ getAlertStateDisplayName(log.state) }}
                            </span>
                        </td>
                        <td class="underline">{{ log.name }}</td>
                        <td class="w-full text-ellipsis">{{ log.message }}</td>
                    </tr>
                </UiTable>
            </div>
        </ScrollAreaViewport>
        <ScrollAreaScrollbar
            class="flex select-none touch-none p-0.5 bg-transparent transition-colors duration-[120ms] ease-out data-[orientation=vertical]:w-2.5"
            orientation="vertical"
        >
            <ScrollAreaThumb
                class="flex-1 bg-border-one opacity-80 rounded-lg relative before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:w-full before:h-full before:min-w-[44px] before:min-h-[44px]"
            />
        </ScrollAreaScrollbar>
    </ScrollAreaRoot>
</template>

<style scoped lang="scss"></style>
