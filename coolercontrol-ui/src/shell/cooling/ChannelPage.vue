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
    mdiAutoFix,
    mdiChartLine,
    mdiChevronDown,
    mdiShareVariantOutline,
    mdiSourceFork,
} from '@mdi/js'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { storeToRefs } from 'pinia'
import { v4 as uuidV4 } from 'uuid'
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ChannelExtensionSettings from '@/components/ChannelExtensionSettings.vue'
import CalibrationBadge from '@/shell/cooling/CalibrationBadge.vue'
import ChannelVerdictNotice from '@/shell/cooling/ChannelVerdictNotice.vue'
import UncontrollableBadge from '@/shell/cooling/UncontrollableBadge.vue'
import FirmwareCurveBadge from '@/shell/cooling/FirmwareCurveBadge.vue'
import EntityTitleRename from '@/components/EntityTitleRename.vue'
import HealthWarning from '@/components/HealthWarning.vue'
import SpeedFixedChart from '@/components/SpeedFixedChart.vue'
import TimeChart from '@/components/TimeChart.vue'
import { Dashboard, DashboardDeviceChannel } from '@/models/Dashboard.ts'
import {
    DeviceSettingWriteManualDTO,
    DeviceSettingWriteProfileDTO,
} from '@/models/DaemonSettings.ts'
import type { Device, UID } from '@/models/Device.ts'
import { DeviceType } from '@/models/Device.ts'
import type { CustomSensor } from '@/models/CustomSensor.ts'
import { Profile } from '@/models/Profile.ts'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import ChainStrip, { type ChainPill } from '@/shell/cooling/ChainStrip.vue'
import ChannelSetupMenu from '@/shell/cooling/ChannelSetupMenu.vue'
import ControlFlowTree from '@/shell/cooling/ControlFlowTree.vue'
import { controlFlowExpanded as flowExpanded } from '@/shell/cooling/controlFlowState.ts'
import {
    buildFlowTree,
    flattenFlow,
    isFlowExpandable,
    type FlowNode,
} from '@/shell/cooling/controlFlow.ts'
import UiButton from '@/shell/ui/UiButton.vue'
import UiNumberInput from '@/shell/ui/UiNumberInput.vue'
import UiSelect, { type UiSelectOption } from '@/shell/ui/UiSelect.vue'
import UiSlider from '@/shell/ui/UiSlider.vue'
import UiToggleGroup from '@/shell/ui/UiToggleGroup.vue'

// The original, fully featured profile editor, embedded with a fixed height.
const ProfileEditor = defineAsyncComponent(() => import('@/views/ProfileView.vue'))

type ControlMode = 'automatic' | 'manual' | 'unmanaged'

const props = defineProps<{ deviceUID: UID; channelName: string }>()

const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const { currentDeviceStatus } = storeToRefs(deviceStore)

const device = computed<Device | undefined>(() => {
    for (const candidate of deviceStore.allDevices()) {
        if (candidate.uid === props.deviceUID) return candidate
    }
    return undefined
})
const channelInfo = computed(() => device.value?.info?.channels.get(props.channelName))
const speedOptions = computed(() => channelInfo.value?.speed_options)
const controllable = computed(() => speedOptions.value?.fixed_enabled ?? false)

const uiSetting = computed(() =>
    settingsStore.allUIDeviceSettings
        .get(props.deviceUID)
        ?.sensorsAndChannels.get(props.channelName),
)
const channelLabel = computed(() => uiSetting.value?.name ?? props.channelName)
const defaultLabel = computed(() =>
    settingsStore.defaultChannelLabel(props.deviceUID, props.channelName),
)
const saveChannelName = async (newName: string): Promise<boolean> =>
    await settingsStore.saveChannelName(props.deviceUID, props.channelName, newName)
const deviceLabel = computed(
    () => settingsStore.allUIDeviceSettings.get(props.deviceUID)?.name ?? '',
)

const daemonSetting = computed(() =>
    settingsStore.allDaemonDeviceSettings.get(props.deviceUID)?.settings.get(props.channelName),
)

const liveDuty = computed(
    () => currentDeviceStatus.value.get(props.deviceUID)?.get(props.channelName)?.duty,
)
const liveRpm = computed(
    () => currentDeviceStatus.value.get(props.deviceUID)?.get(props.channelName)?.rpm,
)

// ----- control mode state -----
const initialControlMode = (): ControlMode => {
    if (daemonSetting.value?.speed_fixed != null) return 'manual'
    if (daemonSetting.value?.profile_uid != null && daemonSetting.value.profile_uid !== '0') {
        return 'automatic'
    }
    return 'unmanaged'
}
const controlMode = ref<ControlMode>(initialControlMode())
const manualDuty = ref<number>(daemonSetting.value?.speed_fixed ?? Number(liveDuty.value ?? '50'))
const selectedProfileUID = ref<UID | undefined>(
    daemonSetting.value?.profile_uid !== '0' ? daemonSetting.value?.profile_uid : undefined,
)

const controlModeOptions = computed(() => [
    { label: t('layout.shell.coolingPage.modeProfile'), value: 'automatic' },
    { label: t('layout.shell.coolingPage.modeManual'), value: 'manual' },
    { label: t('layout.shell.coolingPage.modeUnmanaged'), value: 'unmanaged' },
])

const selectedProfile = computed<Profile | undefined>(() =>
    settingsStore.profiles.find((profile) => profile.uid === selectedProfileUID.value),
)

// channels (other than this one) also driven by the selected profile
const sharedChannels = computed<Array<{ deviceUID: UID; channelName: string }>>(() => {
    if (selectedProfileUID.value == null) return []
    const users: Array<{ deviceUID: UID; channelName: string }> = []
    for (const [devUID, deviceSettings] of settingsStore.allDaemonDeviceSettings) {
        for (const [chName, setting] of deviceSettings.settings) {
            if (setting.profile_uid !== selectedProfileUID.value) continue
            if (devUID === props.deviceUID && chName === props.channelName) continue
            users.push({ deviceUID: devUID, channelName: chName })
        }
    }
    return users
})

const profileOptions = computed<UiSelectOption[]>(() =>
    settingsStore.profiles
        .filter((profile) => profile.uid !== '0')
        .map((profile) => ({ label: profile.name, value: profile.uid })),
)

// ----- chain strip -----
const chainPills = computed<ChainPill[]>(() => {
    if (controlMode.value === 'manual') {
        return [
            {
                kind: 'profile',
                label: t('layout.shell.coolingPage.manualAt', { duty: manualDuty.value }),
            },
        ]
    }
    if (controlMode.value === 'unmanaged' || selectedProfile.value == null) {
        return [{ kind: 'profile', label: t('common.unmanaged') }]
    }
    const pills: ChainPill[] = []
    const source = selectedProfile.value.temp_source
    if (source != null) {
        const custom = customSensor(source.device_uid, source.temp_name)
        pills.push({
            kind: 'tempSource',
            label: tempSourceLabel(source.device_uid, source.temp_name),
            color: tempSourceColor(source.device_uid, source.temp_name),
            to:
                custom != null
                    ? { name: 'device-custom-sensor', params: { customSensorID: source.temp_name } }
                    : {
                          name: 'monitoring-sensor',
                          params: {
                              deviceUID: source.device_uid,
                              channelName: source.temp_name,
                          },
                      },
        })
    }
    pills.push({
        kind: 'profile',
        label: selectedProfile.value.name,
        to:
            selectedProfile.value.uid !== '0'
                ? { name: 'profiles', params: { profileUID: selectedProfile.value.uid } }
                : undefined,
    })
    const fun = settingsStore.functions.find(
        (candidate) => candidate.uid === selectedProfile.value?.function_uid,
    )
    if (fun != null && fun.uid !== '0') {
        pills.push({
            kind: 'function',
            label: fun.name,
            to: { name: 'functions', params: { functionUID: fun.uid } },
        })
    }
    return pills
})

// Full influence tree behind the compact chain, revealed on demand for
// composite (Mix/Overlay) profiles whose members carry their own inputs.
const customSensorsByID = ref<Map<string, CustomSensor>>(new Map())
const customSensorsDeviceUID = computed<string | undefined>(() => {
    for (const device of deviceStore.allDevices()) {
        if (device.type === DeviceType.CUSTOM_SENSORS) return device.uid
    }
    return undefined
})
onMounted(async () => {
    const sensors = await settingsStore.getCustomSensors()
    const map = new Map<string, CustomSensor>()
    for (const sensor of sensors) map.set(sensor.id, sensor)
    customSensorsByID.value = map
})
const functionByUID = (uid: string): { uid: string; name: string } | undefined => {
    if (uid === '0') return undefined
    const fun = settingsStore.functions.find((candidate) => candidate.uid === uid)
    return fun != null ? { uid: fun.uid, name: fun.name } : undefined
}
const tempSourceLabel = (deviceUID: string, channelName: string): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.sensorsAndChannels.get(channelName)?.name ??
    channelName
const tempSourceColor = (deviceUID: string, channelName: string): string | undefined =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.sensorsAndChannels.get(channelName)?.color
const customSensor = (deviceUID: string, channelName: string): CustomSensor | undefined =>
    deviceUID === customSensorsDeviceUID.value
        ? customSensorsByID.value.get(channelName)
        : undefined
const flowTree = computed<FlowNode | null>(() => {
    if (
        controlMode.value === 'manual' ||
        controlMode.value === 'unmanaged' ||
        selectedProfile.value == null
    ) {
        return null
    }
    return buildFlowTree(selectedProfile.value, {
        profiles: settingsStore.profiles,
        functionByUID,
        sensorLabel: tempSourceLabel,
        customSensor,
    })
})
const flowRows = computed(() => (flowTree.value != null ? flattenFlow(flowTree.value) : []))
const flowExpandable = computed(() => flowTree.value != null && isFlowExpandable(flowTree.value))

// ----- apply / fork -----
const applying = ref(false)
const extensionSettingsRef = ref()
const editorRef = ref()
const editorDirty = computed<boolean>(() => editorRef.value?.contextIsDirty === true)

const assignmentDirty = computed<boolean>(() => {
    if (controlMode.value === 'manual') {
        return daemonSetting.value?.speed_fixed !== manualDuty.value
    }
    if (controlMode.value === 'unmanaged') {
        return (
            daemonSetting.value?.speed_fixed != null ||
            (daemonSetting.value?.profile_uid != null && daemonSetting.value.profile_uid !== '0')
        )
    }
    return daemonSetting.value?.profile_uid !== selectedProfileUID.value
})

const canApply = computed<boolean>(() => {
    if (!controllable.value || applying.value) return false
    if (controlMode.value === 'automatic') {
        if (selectedProfileUID.value == null) return false
        return assignmentDirty.value || editorDirty.value
    }
    return assignmentDirty.value
})

const apply = async (): Promise<void> => {
    if (applying.value) return
    applying.value = true
    try {
        if (controlMode.value === 'manual') {
            await settingsStore.saveDaemonDeviceSettingManual(
                props.deviceUID,
                props.channelName,
                new DeviceSettingWriteManualDTO(manualDuty.value),
            )
        } else if (controlMode.value === 'unmanaged') {
            await settingsStore.saveDaemonDeviceSettingProfile(
                props.deviceUID,
                props.channelName,
                new DeviceSettingWriteProfileDTO('0'),
            )
        } else if (selectedProfileUID.value != null) {
            if (editorDirty.value) {
                await editorRef.value?.saveProfileState?.()
                // still dirty means the editor's validation rejected the save
                if (editorDirty.value) return
            }
            if (assignmentDirty.value) {
                await settingsStore.saveDaemonDeviceSettingProfile(
                    props.deviceUID,
                    props.channelName,
                    new DeviceSettingWriteProfileDTO(selectedProfileUID.value),
                )
            }
        }
        extensionSettingsRef.value?.saveChannelExtensionSettings?.()
    } finally {
        applying.value = false
    }
}

// Clones the shared profile so edits below only affect this fan.
const forkProfile = async (): Promise<void> => {
    const source = selectedProfile.value
    if (source == null || applying.value) return
    applying.value = true
    try {
        const forked = plainToInstance(Profile, instanceToPlain(source))
        forked.uid = uuidV4()
        forked.name = `${source.name} (${channelLabel.value})`
        settingsStore.profiles.push(forked)
        const saved = await settingsStore.saveProfile(forked.uid)
        if (!saved) return
        await settingsStore.saveDaemonDeviceSettingProfile(
            props.deviceUID,
            props.channelName,
            new DeviceSettingWriteProfileDTO(forked.uid),
        )
        selectedProfileUID.value = forked.uid
    } finally {
        applying.value = false
    }
}

// Chart canvases consume plain wheel events for zoom; stop them in the capture
// phase so the page scrolls. Ctrl+wheel (and trackpad pinch) passes through.
const onPageWheelCapture = (event: WheelEvent): void => {
    if (!event.ctrlKey) event.stopPropagation()
}

// ----- live chart -----
const createChannelDashboard = (): Dashboard => {
    const dash = new Dashboard(channelLabel.value)
    dash.timeRangeSeconds = 300
    dash.dataTypes = []
    dash.deviceChannelNames.push(new DashboardDeviceChannel(props.deviceUID, props.channelName))
    const setting = uiSetting.value
    if (setting != null) setting.channelDashboard = dash
    return dash
}
const channelDashboard = ref(uiSetting.value?.channelDashboard ?? createChannelDashboard())
if (channelDashboard.value.dataTypes.length > 0) {
    channelDashboard.value.dataTypes = []
}
</script>

<template>
    <div class="flex h-full flex-col gap-4 overflow-y-auto p-4" @wheel.capture="onPageWheelCapture">
        <div class="flex flex-wrap items-start gap-3">
            <div class="min-w-0">
                <div class="flex items-baseline gap-2">
                    <EntityTitleRename
                        class="!py-0 !pl-0"
                        :current-name="channelLabel"
                        :fallback-name="defaultLabel"
                        :save-name-function="saveChannelName"
                    />
                    <span class="truncate text-base text-text-color-secondary">
                        {{ deviceLabel }}
                    </span>
                </div>
            </div>
            <div class="ml-auto flex items-center gap-3">
                <span class="text-2xl font-semibold font-numeric tabular-nums text-text-color">
                    {{ liveDuty != null ? `${liveDuty}%` : '--' }}
                </span>
                <span
                    v-if="liveRpm != null"
                    class="text-base font-numeric tabular-nums text-text-color-secondary"
                >
                    {{ liveRpm }} rpm
                </span>
            </div>
        </div>

        <HealthWarning kind="channel" :device-uid="deviceUID" :channel-name="channelName" />

        <ChainStrip
            :channel-label="channelLabel"
            :pills="chainPills"
            :expandable="flowExpandable"
            :expanded="flowExpanded"
            @toggle-expand="flowExpanded = !flowExpanded"
        />
        <ControlFlowTree v-if="flowExpanded && flowExpandable" :rows="flowRows" />

        <template v-if="controllable">
            <div class="flex flex-wrap items-center gap-3">
                <UiToggleGroup v-model="controlMode" :options="controlModeOptions" />
                <ChannelSetupMenu :device-u-i-d="deviceUID" :channel-name="channelName">
                    <template #trigger>
                        <UiButton variant="outline">
                            <svg-icon type="mdi" :path="mdiAutoFix" :size="16" />
                            {{ t('layout.shell.coolingPage.guidedSetup') }}
                            <svg-icon type="mdi" :path="mdiChevronDown" :size="16" />
                        </UiButton>
                    </template>
                </ChannelSetupMenu>
                <ChannelExtensionSettings
                    ref="extensionSettingsRef"
                    :device-u-i-d="deviceUID"
                    :channel-name="channelName"
                    :chosen-profile="controlMode === 'automatic' ? selectedProfile : undefined"
                />
                <FirmwareCurveBadge
                    :device-u-i-d="deviceUID"
                    :channel-name="channelName"
                    :size="20"
                />
                <CalibrationBadge
                    :device-u-i-d="deviceUID"
                    :channel-name="channelName"
                    :size="20"
                />
                <UncontrollableBadge
                    :device-u-i-d="deviceUID"
                    :channel-name="channelName"
                    :size="20"
                />
                <UiButton
                    class="ml-auto"
                    :class="{ 'animate-pulse-fast': editorDirty }"
                    :disabled="!canApply"
                    @click="apply"
                >
                    {{
                        editorDirty
                            ? t('layout.shell.coolingPage.saveAndApply')
                            : t('layout.shell.coolingPage.apply')
                    }}
                </UiButton>
            </div>

            <!-- Manual -->
            <div
                v-if="controlMode === 'manual'"
                class="flex flex-col gap-3 rounded-lg border border-border-one p-3"
            >
                <span class="text-sm text-text-color-secondary">
                    {{ t('layout.shell.coolingPage.manualDuty') }}
                </span>
                <div class="flex flex-wrap items-center gap-4">
                    <UiSlider
                        v-model="manualDuty"
                        :min="speedOptions?.min_duty ?? 0"
                        :max="speedOptions?.max_duty ?? 100"
                        class="w-full max-w-md"
                    />
                    <UiNumberInput
                        v-model="manualDuty"
                        :min="speedOptions?.min_duty ?? 0"
                        :max="speedOptions?.max_duty ?? 100"
                        :step="1"
                        suffix="%"
                    />
                </div>
                <SpeedFixedChart
                    :duty="manualDuty"
                    :current-device-u-i-d="deviceUID"
                    :current-sensor-name="channelName"
                    style="--gauge-height: clamp(24rem, calc(100vh - 32rem), 44rem)"
                />
            </div>

            <!-- Unmanaged -->
            <div
                v-else-if="controlMode === 'unmanaged'"
                class="flex flex-col gap-3 rounded-lg border border-border-one p-3"
            >
                <p class="max-w-xl text-base text-text-color-secondary">
                    {{ t('layout.shell.coolingPage.unmanagedHint') }}
                </p>
                <SpeedFixedChart
                    :default-profile="true"
                    :current-device-u-i-d="deviceUID"
                    :current-sensor-name="channelName"
                    style="--gauge-height: clamp(24rem, calc(100vh - 32rem), 44rem)"
                />
            </div>

            <!-- Profile -->
            <div v-else class="flex flex-col gap-4">
                <div
                    class="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-lg border border-border-one p-3"
                >
                    <div class="flex flex-col gap-1">
                        <span class="text-sm text-text-color-secondary">
                            {{ t('layout.shell.coolingPage.chain.profile') }}
                        </span>
                        <UiSelect
                            v-model="selectedProfileUID"
                            :options="profileOptions"
                            :placeholder="t('layout.shell.coolingPage.selectProfile')"
                        />
                    </div>
                    <div v-if="sharedChannels.length > 0" class="flex items-center gap-2">
                        <span
                            class="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border-one bg-bg-two px-3 text-sm text-text-color-secondary"
                            v-tooltip.top="t('layout.shell.coolingPage.sharedTooltip')"
                        >
                            <svg-icon type="mdi" :path="mdiShareVariantOutline" :size="13" />
                            {{
                                t('layout.shell.coolingPage.sharedWith', {
                                    count: sharedChannels.length,
                                })
                            }}
                        </span>
                        <UiButton variant="outline" :disabled="applying" @click="forkProfile">
                            <svg-icon type="mdi" :path="mdiSourceFork" :size="14" />
                            {{ t('layout.shell.coolingPage.forkForFan') }}
                        </UiButton>
                    </div>
                </div>

                <div v-if="selectedProfileUID != null" class="rounded-lg border border-border-one">
                    <ProfileEditor
                        ref="editorRef"
                        :key="selectedProfileUID"
                        :profile-u-i-d="selectedProfileUID"
                        :channel-device-u-i-d="deviceUID"
                        :channel-name="channelName"
                        graph-height="clamp(30rem, calc(100vh - 26rem), 44rem)"
                        hide-save
                    />
                </div>
            </div>
        </template>
        <ChannelVerdictNotice v-else :device-u-i-d="deviceUID" :channel-name="channelName" />

        <!-- relative lifts this above the ProfileEditor's empty overhang box,
             which otherwise swallows pointer events on the link and chart top. -->
        <div class="relative shrink-0" style="--time-chart-height: 24rem">
            <div class="mb-1 flex justify-center">
                <RouterLink
                    :to="{ name: 'monitoring-sensor', params: { deviceUID, channelName } }"
                    class="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-text-color-secondary outline-none hover:bg-surface-hover hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                >
                    <svg-icon type="mdi" :path="mdiChartLine" :size="16" />
                    {{ t('layout.shell.coolingPage.fullChart') }}
                </RouterLink>
            </div>
            <TimeChart :dashboard="channelDashboard" />
        </div>
    </div>
</template>
