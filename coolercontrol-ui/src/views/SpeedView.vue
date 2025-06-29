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
import { mdiAlertOutline, mdiContentSaveOutline, mdiTuneVerticalVariant } from '@mdi/js'
import Select from 'primevue/select'
import { defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, type Ref, watch } from 'vue'
import { Profile, ProfileType } from '@/models/Profile'
import { useSettingsStore } from '@/stores/SettingsStore'
import Button from 'primevue/button'
import SpeedFixedChart from '@/components/SpeedFixedChart.vue'
import SpeedGraphChart from '@/components/SpeedGraphChart.vue'
import SpeedMixChart from '@/components/SpeedMixChart.vue'
import { type UID } from '@/models/Device'
import { useDeviceStore } from '@/stores/DeviceStore'
import { storeToRefs } from 'pinia'
import {
    DeviceSettingReadDTO,
    DeviceSettingWriteManualDTO,
    DeviceSettingWriteProfileDTO,
} from '@/models/DaemonSettings'
import InputNumber from 'primevue/inputnumber'
import Slider from 'primevue/slider'
import { $enum } from 'ts-enum-util'
import { ChannelViewType, SensorAndChannelSettings } from '@/models/UISettings.ts'
import { ChartType, Dashboard, DashboardDeviceChannel } from '@/models/Dashboard.ts'
import TimeChart from '@/components/TimeChart.vue'
import SensorTable from '@/components/SensorTable.vue'
import AxisOptions from '@/components/AxisOptions.vue'
import { v4 as uuidV4 } from 'uuid'
import _ from 'lodash'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import { useI18n } from 'vue-i18n'
import { useDialog } from 'primevue/usedialog'

interface Props {
    deviceUID: UID
    channelName: string
}

const props = defineProps<Props>()

const { t } = useI18n()
const settingsStore = useSettingsStore()
const deviceStore = useDeviceStore()
const { currentDeviceStatus } = storeToRefs(deviceStore)
const componentKey: Ref<number> = ref(0)
const confirm = useConfirm()
const dialog = useDialog()
const fanControlWizard = defineAsyncComponent(
    () => import('../components/wizards/fan-control/Wizard.vue'),
)

const contextIsDirty: Ref<boolean> = ref(false)

const deviceLabel = settingsStore.allUIDeviceSettings.get(props.deviceUID)!.name
let startingManualControlEnabled = false
let startingProfile = settingsStore.profiles.find((profile) => profile.uid === '0')! // default profile as default
const startingDeviceSetting: DeviceSettingReadDTO | undefined =
    settingsStore.allDaemonDeviceSettings.get(props.deviceUID)?.settings.get(props.channelName)
const uiChannelSetting: SensorAndChannelSettings = settingsStore.allUIDeviceSettings
    .get(props.deviceUID)!
    .sensorsAndChannels.get(props.channelName)!

const channelIsControllable = (): boolean => {
    for (const device of deviceStore.allDevices()) {
        if (device.uid === props.deviceUID && device.info != null) {
            const channelInfo = device.info.channels.get(props.channelName)
            if (channelInfo != null && channelInfo.speed_options != null) {
                return channelInfo.speed_options.fixed_enabled
            }
        }
    }
    return false
}

if (channelIsControllable()) {
    if (startingDeviceSetting?.speed_fixed != null) {
        startingManualControlEnabled = true
    } else if (startingDeviceSetting?.profile_uid != null) {
        startingProfile = settingsStore.profiles.find(
            (profile) => profile.uid === startingDeviceSetting!.profile_uid,
        )!
    }
}
const selectedProfile: Ref<Profile> = ref(startingProfile)
const manualControlEnabled: Ref<boolean> = ref(startingManualControlEnabled)
const chosenViewType: Ref<ChannelViewType> = ref(
    channelIsControllable() ? uiChannelSetting.viewType : ChannelViewType.Dashboard,
)

// Create a mapping from enum values to i18n keys
const viewTypeToKey = {
    [ChannelViewType.Control]: 'control',
    [ChannelViewType.Dashboard]: 'dashboard',
}

const viewTypeOptions = channelIsControllable()
    ? [...$enum(ChannelViewType).keys()].map((type) => ({
          value: type,
          label: t(`models.channelViewType.${viewTypeToKey[type]}`),
      }))
    : [
          {
              value: ChannelViewType.Dashboard,
              label: t(`models.channelViewType.${viewTypeToKey[ChannelViewType.Dashboard]}`),
          },
      ]

const channelLabel =
    settingsStore.allUIDeviceSettings
        .get(props.deviceUID)
        ?.sensorsAndChannels.get(props.channelName)?.name ?? props.channelName

const createNewDashboard = (): Dashboard => {
    const dash = new Dashboard(channelLabel)
    dash.timeRangeSeconds = 300
    // needed due to reduced default data type range:
    dash.dataTypes = []
    dash.deviceChannelNames.push(new DashboardDeviceChannel(props.deviceUID, props.channelName))
    settingsStore.allUIDeviceSettings
        .get(props.deviceUID)!
        .sensorsAndChannels.get(props.channelName)!.channelDashboard = dash
    return dash
}
const singleDashboard = ref(
    settingsStore.allUIDeviceSettings
        .get(props.deviceUID)!
        .sensorsAndChannels.get(props.channelName)!.channelDashboard ?? createNewDashboard(),
)
// Fixes an issue with the original implementation where there was a saved types filter for
// single Dashboards - which would annoyingly hide some metrics like i.e. RPMs.
if (singleDashboard.value.dataTypes.length > 0) {
    singleDashboard.value.dataTypes = []
}

// Create a mapping from enum values to i18n keys
const chartTypeToKey = {
    [ChartType.TIME_CHART]: 'timeChart',
    [ChartType.TABLE]: 'table',
    [ChartType.CONTROLS]: 'controls',
}

const chartTypes = [...$enum(ChartType).values()].map((type) => ({
    value: type,
    label: t(`models.chartType.${chartTypeToKey[type]}`),
}))
const chartMinutesMin: number = 1
const chartMinutesMax: number = 60
const chartMinutes: Ref<number> = ref(singleDashboard.value.timeRangeSeconds / 60)
const chartMinutesScrolled = (event: WheelEvent): void => {
    if (event.deltaY < 0) {
        if (chartMinutes.value < chartMinutesMax) chartMinutes.value += 1
    } else {
        if (chartMinutes.value > chartMinutesMin) chartMinutes.value -= 1
    }
}

const addScrollEventListener = (): void => {
    // @ts-ignore
    document?.querySelector('.chart-minutes')?.addEventListener('wheel', chartMinutesScrolled)
}
const chartMinutesChanged = (value: number): void => {
    singleDashboard.value.timeRangeSeconds = value * 60
}
const chartKey: Ref<string> = ref(uuidV4())

const getCurrentDuty = (): number | undefined => {
    const duty = currentDeviceStatus.value.get(props.deviceUID)?.get(props.channelName)?.duty
    return duty != null ? Number(duty) : undefined
}

const startingDuty: number = startingDeviceSetting?.speed_fixed ?? (getCurrentDuty() || 0)
const manualDuty: Ref<number> = ref(startingDuty)
let dutyMin = 0
let dutyMax = 100
for (const device of deviceStore.allDevices()) {
    if (device.uid === props.deviceUID && device.info != null) {
        const channelInfo = device.info.channels.get(props.channelName)
        if (channelInfo != null && channelInfo.speed_options != null) {
            dutyMin = channelInfo.speed_options.min_duty
            dutyMax = channelInfo.speed_options.max_duty
        }
    }
}

const getProfileOptions = (): any[] => {
    if (channelIsControllable()) {
        return settingsStore.profiles
    } else {
        return [settingsStore.profiles.find((profile) => profile.uid === '0')]
    }
}

const getManualProfileOptions = () => [
    { value: false, label: t('views.speed.automatic') },
    { value: true, label: t('views.speed.manual') },
]

const saveSetting = async () => {
    if (manualControlEnabled.value) {
        if (manualDuty.value == null) {
            return
        }
        const setting = new DeviceSettingWriteManualDTO(manualDuty.value)
        await settingsStore.saveDaemonDeviceSettingManual(
            props.deviceUID,
            props.channelName,
            setting,
        )
        contextIsDirty.value = false
    } else {
        const setting = new DeviceSettingWriteProfileDTO(selectedProfile.value.uid)
        await settingsStore.saveDaemonDeviceSettingProfile(
            props.deviceUID,
            props.channelName,
            setting,
        )
        contextIsDirty.value = false
    }
}

const manualScrolled = (event: WheelEvent): void => {
    if (manualDuty.value == null) return
    if (event.deltaY < 0) {
        if (manualDuty.value < dutyMax) manualDuty.value += 1
    } else {
        if (manualDuty.value > dutyMin) manualDuty.value -= 1
    }
}

const viewTypeChanged = () => {
    settingsStore.allUIDeviceSettings
        .get(props.deviceUID)!
        .sensorsAndChannels.get(props.channelName)!.viewType = chosenViewType.value
}

const checkForUnsavedChanges = (_to: any, _from: any, next: any): void => {
    if (!contextIsDirty.value) {
        next()
        return
    }
    confirm.require({
        message: t('views.speed.unsavedChangesMessage'),
        header: t('views.speed.unsavedChanges'),
        icon: 'pi pi-exclamation-triangle',
        defaultFocus: 'accept',
        rejectLabel: t('common.stay'),
        acceptLabel: t('common.discard'),
        accept: () => {
            next()
            contextIsDirty.value = false
        },
        reject: () => next(false),
    })
}
const updateResponsiveGraphHeight = (): void => {
    const graphEl = document.getElementById('control-graph')
    const controlPanel = document.getElementById('control-panel')
    if (graphEl != null && controlPanel != null) {
        const panelHeight = controlPanel.getBoundingClientRect().height
        if (panelHeight > 56) {
            // 4rem
            graphEl.style.height = `max(calc(100vh - (${panelHeight}px + 0.5rem)), 20rem)`
        } else {
            graphEl.style.height = 'max(calc(100vh - 4rem), 20rem)'
        }
    }
}

const openFanControlWizard = () => {
    dialog.open(fanControlWizard, {
        props: {
            header: t('components.wizards.fanControl.fanControlWizard'),
            position: 'center',
            modal: true,
            dismissableMask: true,
        },
        data: {
            deviceUID: props.deviceUID,
            channelName: props.channelName,
            selectedProfileUID: manualControlEnabled.value ? undefined : selectedProfile.value.uid,
        },
    })
}

onMounted(() => {
    // @ts-ignore
    document.querySelector('.manual-input')?.addEventListener('wheel', manualScrolled)
    watch(manualControlEnabled, async (newValue: boolean): Promise<void> => {
        // needed if not enabled on UI mount:
        if (newValue) {
            await nextTick(async () => {
                // @ts-ignore
                document.querySelector('.manual-input')?.addEventListener('wheel', manualScrolled)
            })
        }
    })

    window.addEventListener('resize', updateResponsiveGraphHeight)
    setTimeout(updateResponsiveGraphHeight)

    addScrollEventListener()
    watch(chartMinutes, (newValue: number): void => {
        chartMinutesChanged(newValue)
    })
    watch(
        settingsStore.allUIDeviceSettings,
        _.debounce(() => (chartKey.value = uuidV4()), 400, { leading: true }),
    )

    watch([manualControlEnabled, manualDuty, selectedProfile], () => {
        contextIsDirty.value = true
    })
    watch(selectedProfile, () => {
        setTimeout(updateResponsiveGraphHeight)
    })
    onBeforeRouteUpdate(checkForUnsavedChanges)
    onBeforeRouteLeave(checkForUnsavedChanges)
})
onUnmounted(() => {
    window.removeEventListener('resize', updateResponsiveGraphHeight)
})
</script>

<template>
    <div id="control-panel" class="flex border-b-4 border-border-one items-center justify-between">
        <div class="flex pl-4 py-2 text-2xl overflow-hidden">
            <span class="overflow-hidden overflow-ellipsis">{{ deviceLabel }}:&nbsp;</span>
            <span class="font-bold">{{ channelLabel }}</span>
        </div>
        <div class="flex flex-wrap gap-x-1 justify-end">
            <div v-if="chosenViewType === ChannelViewType.Control" class="p-2 pr-0">
                <Button
                    class="!p-2 w-12 h-[2.375rem] bg-accent/80 hover:!bg-accent"
                    v-tooltip.bottom="t('components.wizards.fanControl.fanControlWizard')"
                    :disabled="!channelIsControllable()"
                    @click="openFanControlWizard"
                >
                    <svg-icon
                        class="outline-0"
                        type="mdi"
                        :path="mdiTuneVerticalVariant"
                        :size="deviceStore.getREMSize(1.25)"
                    />
                </Button>
            </div>
            <div
                v-if="chosenViewType === ChannelViewType.Control && manualControlEnabled"
                class="p-2 pr-0"
            >
                <InputNumber
                    placeholder="Duty"
                    v-model="manualDuty"
                    mode="decimal"
                    class="duty-input w-full"
                    suffix="%"
                    showButtons
                    :min="dutyMin"
                    :max="dutyMax"
                    :use-grouping="false"
                    :step="1"
                    button-layout="horizontal"
                    :input-style="{ width: '8rem' }"
                    v-tooltip.bottom="t('views.speed.manualDuty')"
                >
                    <template #incrementicon>
                        <span class="pi pi-plus" />
                    </template>
                    <template #decrementicon>
                        <span class="pi pi-minus" />
                    </template>
                </InputNumber>
                <Slider
                    v-model="manualDuty"
                    class="!w-[11.5rem] ml-1.5"
                    :step="1"
                    :min="dutyMin"
                    :max="dutyMax"
                />
            </div>
            <div
                v-else-if="chosenViewType === ChannelViewType.Control && !manualControlEnabled"
                class="flex flex-row"
            >
                <div class="p-2 pr-0">
                    <Select
                        v-model="selectedProfile"
                        :options="getProfileOptions()"
                        option-label="name"
                        placeholder="Profile"
                        class="w-full mr-4 h-full"
                        checkmark
                        dropdown-icon="pi pi-chart-line"
                        scroll-height="40rem"
                        v-tooltip.bottom="t('views.speed.profileToApply')"
                    />
                </div>
            </div>
            <div
                v-else-if="
                    chosenViewType === ChannelViewType.Dashboard &&
                    singleDashboard.chartType == ChartType.TIME_CHART
                "
                class="p-2 pr-0 flex flex-row"
            >
                <InputNumber
                    placeholder="Minutes"
                    input-id="chart-minutes"
                    v-model="chartMinutes"
                    class="h-[2.375rem] chart-minutes"
                    :suffix="` ${t('common.minuteAbbr')}`"
                    show-buttons
                    :use-grouping="false"
                    :step="1"
                    :min="chartMinutesMin"
                    :max="chartMinutesMax"
                    button-layout="horizontal"
                    :allow-empty="false"
                    :input-style="{ width: '5rem' }"
                    v-tooltip.bottom="t('views.dashboard.timeRange')"
                >
                    <template #incrementicon>
                        <span class="pi pi-plus" />
                    </template>
                    <template #decrementicon>
                        <span class="pi pi-minus" />
                    </template>
                </InputNumber>
                <axis-options class="h-[2.375rem] ml-3" :dashboard="singleDashboard" />
            </div>
            <div v-if="chosenViewType === ChannelViewType.Dashboard" class="p-2 pr-0">
                <Select
                    v-model="singleDashboard.chartType"
                    :options="chartTypes"
                    placeholder="Select a Chart Type"
                    class="w-32 h-full"
                    checkmark
                    option-label="label"
                    option-value="value"
                    dropdown-icon="pi pi-chart-bar"
                    scroll-height="400px"
                    v-tooltip.bottom="t('views.dashboard.chartType')"
                />
            </div>
            <div class="p-2 pr-0 flex flex-row">
                <Select
                    v-if="chosenViewType === ChannelViewType.Control"
                    v-model="manualControlEnabled"
                    :options="getManualProfileOptions()"
                    option-label="label"
                    option-value="value"
                    class="w-32 mr-3"
                    placeholder="Control Type"
                    checkmark
                    dropdown-icon="pi pi-cog"
                    scroll-height="40rem"
                    v-tooltip.bottom="t('views.speed.automaticOrManual')"
                />
                <div
                    v-if="!channelIsControllable()"
                    class="pr-4 py-2 flex flex-row leading-none items-center"
                    v-tooltip.bottom="t('views.speed.driverNoSupportControl')"
                >
                    <svg-icon
                        type="mdi"
                        class="text-warning"
                        :path="mdiAlertOutline"
                        :size="deviceStore.getREMSize(1.5)"
                    />
                </div>
                <Select
                    v-model="chosenViewType"
                    :options="viewTypeOptions"
                    class="w-32"
                    placeholder="View Type"
                    checkmark
                    option-label="label"
                    option-value="value"
                    dropdown-icon="pi pi-sliders-h"
                    scroll-height="40rem"
                    @change="viewTypeChanged"
                    v-tooltip.bottom="t('views.speed.controlOrView')"
                />
            </div>
            <div class="p-2 flex flex-row">
                <Button
                    class="bg-accent/80 hover:!bg-accent w-32 h-[2.375rem]"
                    :class="{ 'animate-pulse-fast': contextIsDirty }"
                    :label="t('common.apply')"
                    v-tooltip.bottom="t('views.speed.applySetting')"
                    @click="saveSetting"
                    :disabled="
                        !channelIsControllable() || chosenViewType === ChannelViewType.Dashboard
                    "
                >
                    <svg-icon
                        class="outline-0"
                        type="mdi"
                        :path="mdiContentSaveOutline"
                        :size="deviceStore.getREMSize(1.5)"
                    />
                </Button>
            </div>
        </div>
    </div>
    <div class="flex flex-col">
        <div v-if="chosenViewType === ChannelViewType.Control && manualControlEnabled">
            <SpeedFixedChart
                :duty="manualDuty"
                :current-device-u-i-d="props.deviceUID"
                :current-sensor-name="props.channelName"
                :key="'manual' + props.deviceUID + props.channelName"
            />
        </div>
        <div v-else-if="chosenViewType === ChannelViewType.Control">
            <SpeedFixedChart
                v-if="selectedProfile.p_type === ProfileType.Default"
                :default-profile="true"
                :profile="selectedProfile"
                :current-device-u-i-d="props.deviceUID"
                :current-sensor-name="props.channelName"
                :key="'default' + props.deviceUID + props.channelName + selectedProfile.uid"
            />
            <SpeedFixedChart
                v-else-if="selectedProfile.p_type === ProfileType.Fixed"
                :duty="selectedProfile.speed_fixed"
                :current-device-u-i-d="props.deviceUID"
                :current-sensor-name="props.channelName"
                :key="'fixed' + props.deviceUID + props.channelName + selectedProfile.uid"
            />
            <SpeedGraphChart
                v-else-if="selectedProfile.p_type === ProfileType.Graph"
                :profile="selectedProfile"
                :current-device-u-i-d="props.deviceUID"
                :current-sensor-name="props.channelName"
                :key="
                    'graph' +
                    componentKey +
                    props.deviceUID +
                    props.channelName +
                    selectedProfile.uid
                "
            />
            <SpeedMixChart
                v-else-if="selectedProfile.p_type === ProfileType.Mix"
                :profile="selectedProfile"
                :current-device-u-i-d="props.deviceUID"
                :current-sensor-name="props.channelName"
                :key="
                    'mix' + componentKey + props.deviceUID + props.channelName + selectedProfile.uid
                "
            />
        </div>
        <div v-else-if="chosenViewType === ChannelViewType.Dashboard">
            <TimeChart
                v-if="singleDashboard.chartType == ChartType.TIME_CHART"
                :dashboard="singleDashboard"
                :key="chartKey"
            />
            <SensorTable
                v-else-if="singleDashboard.chartType == ChartType.TABLE"
                :dashboard="singleDashboard"
                :key="'table' + chartKey"
            />
        </div>
    </div>
</template>

<style scoped lang="scss"></style>
