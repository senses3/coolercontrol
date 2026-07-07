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
    mdiPageFirst,
    mdiPageLast,
    mdiChevronLeft,
    mdiChevronRight,
} from '@mdi/js'
import { ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from 'reka-ui'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { AlertState, getAlertStateDisplayName, getAlertStateIcon } from '@/models/Alert.ts'
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
    <div class="flex h-[3.5rem] border-b-4 border-border-one items-center justify-between">
        <div class="pl-4 py-2 text-2xl font-bold">{{ t('views.alerts.alertsOverview') }}</div>
    </div>
    <ScrollAreaRoot style="--scrollbar-size: 10px">
        <ScrollAreaViewport class="p-4 pb-16 h-screen w-full">
            <div class="mt-8 flex flex-col">
                <div class="w-max">
                    <div class="flex items-center justify-between">
                        <span class="pb-1 ml-1 font-semibold text-xl text-text-color">{{
                            t('layout.topbar.alerts')
                        }}</span>
                        <UiButton
                            size="sm"
                            class="my-2"
                            v-tooltip.top="{ value: t('layout.menu.tooltips.addAlert') }"
                            @click="router.push({ name: 'monitoring-alert-new' })"
                        >
                            <svg-icon
                                class="outline-0"
                                type="mdi"
                                :path="mdiBellPlusOutline"
                                :size="deviceStore.getREMSize(1.25)"
                            />
                        </UiButton>
                    </div>
                    <UiTable>
                        <template #head>
                            <tr>
                                <th></th>
                                <th>{{ t('common.state') }}</th>
                                <th class="w-full">{{ t('common.name') }}</th>
                            </tr>
                        </template>
                        <tr
                            v-for="alert in alertsList"
                            :key="alert.uid"
                            class="cursor-pointer hover:bg-surface-hover"
                            @click="onRowSelect(alert.uid)"
                        >
                            <td>
                                <svg-icon
                                    type="mdi"
                                    :class="{ 'text-error': alert.state === AlertState.Active }"
                                    :path="getAlertStateIcon(alert.state!)"
                                    :size="getREMSize(1.5)"
                                />
                            </td>
                            <td>
                                <span
                                    class="underline"
                                    :class="{
                                        'text-error': alert.state === AlertState.Active,
                                        'text-success': alert.state === AlertState.Inactive,
                                    }"
                                >
                                    {{ getAlertStateDisplayName(alert.state!) }}
                                </span>
                            </td>
                            <td class="w-full text-ellipsis underline">{{ alert.name }}</td>
                        </tr>
                    </UiTable>
                </div>
            </div>
            <div class="mt-8 flex flex-col">
                <span class="pb-3 ml-1 font-semibold text-xl text-text-color">{{
                    t('views.alerts.alertLogs')
                }}</span>
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
                        <UiSelect v-model="logRows" :options="logRowsOptions" class="!min-w-24" />
                    </div>
                </div>
                <UiTable class="w-full">
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
