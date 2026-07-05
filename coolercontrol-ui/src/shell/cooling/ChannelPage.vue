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
import { mdiAutoFix, mdiShareVariantOutline, mdiSourceFork } from '@mdi/js'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { storeToRefs } from 'pinia'
import { v4 as uuidV4 } from 'uuid'
import { computed, defineAsyncComponent, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ChannelExtensionSettings from '@/components/ChannelExtensionSettings.vue'
import HealthWarning from '@/components/HealthWarning.vue'
import SpeedFixedChart from '@/components/SpeedFixedChart.vue'
import TimeChart from '@/components/TimeChart.vue'
import { useFanControlWizard } from '@/composables/useFanControlWizard.ts'
import { Dashboard, DashboardDeviceChannel } from '@/models/Dashboard.ts'
import {
    DeviceSettingWriteManualDTO,
    DeviceSettingWriteProfileDTO,
} from '@/models/DaemonSettings.ts'
import type { Device, UID } from '@/models/Device.ts'
import { Profile } from '@/models/Profile.ts'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import ChainStrip, { type ChainPill } from '@/shell/cooling/ChainStrip.vue'
import UiButton from '@/shell/ui/UiButton.vue'
import UiSelect, { type UiSelectOption } from '@/shell/ui/UiSelect.vue'
import UiSeparator from '@/shell/ui/UiSeparator.vue'
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
const wizard = useFanControlWizard()

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
const deviceLabel = computed(
    () => settingsStore.allUIDeviceSettings.get(props.deviceUID)?.name ?? '',
)

const daemonSetting = computed(() =>
    settingsStore.allDaemonDeviceSettings.get(props.deviceUID)?.settings.get(props.channelName),
)

const live = computed(() => currentDeviceStatus.value.get(props.deviceUID)?.get(props.channelName))

// ----- control mode state -----
const initialControlMode = (): ControlMode => {
    if (daemonSetting.value?.speed_fixed != null) return 'manual'
    if (daemonSetting.value?.profile_uid != null && daemonSetting.value.profile_uid !== '0') {
        return 'automatic'
    }
    return 'unmanaged'
}
const controlMode = ref<ControlMode>(initialControlMode())
const manualDuty = ref<number>(daemonSetting.value?.speed_fixed ?? Number(live.value?.duty ?? '50'))
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
        const label =
            settingsStore.allUIDeviceSettings
                .get(source.device_uid)
                ?.sensorsAndChannels.get(source.temp_name)?.name ?? source.temp_name
        pills.push({ kind: 'tempSource', label })
    }
    pills.push({ kind: 'profile', label: selectedProfile.value.name })
    const fun = settingsStore.functions.find(
        (candidate) => candidate.uid === selectedProfile.value?.function_uid,
    )
    if (fun != null && fun.uid !== '0') {
        pills.push({ kind: 'function', label: fun.name })
    }
    return pills
})

const profileSection = ref<HTMLElement>()
const editorSection = ref<HTMLElement>()
const onPillClick = (kind: ChainPill['kind']): void => {
    const target = kind === 'profile' ? profileSection.value : editorSection.value
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

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

const openWizard = (): void => {
    wizard.open({
        deviceUID: props.deviceUID,
        channelName: props.channelName,
        selectedProfileUID:
            controlMode.value === 'manual'
                ? undefined
                : controlMode.value === 'unmanaged'
                  ? '0'
                  : selectedProfileUID.value,
    })
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
        <div class="flex flex-wrap items-center gap-3">
            <div class="min-w-0">
                <h1 class="truncate text-xl font-semibold text-text-color">{{ channelLabel }}</h1>
                <div class="truncate text-sm text-text-color-secondary">{{ deviceLabel }}</div>
            </div>
            <div class="ml-auto flex items-center gap-3">
                <span class="text-2xl font-semibold tabular-nums text-text-color">
                    {{ live?.duty != null ? `${live.duty}%` : '--' }}
                </span>
                <span
                    v-if="live?.rpm != null"
                    class="text-sm tabular-nums text-text-color-secondary"
                >
                    {{ live.rpm }} rpm
                </span>
            </div>
        </div>

        <HealthWarning kind="channel" :device-uid="deviceUID" :channel-name="channelName" />

        <ChainStrip :channel-label="channelLabel" :pills="chainPills" @pill-click="onPillClick" />

        <template v-if="controllable">
            <div class="flex flex-wrap items-center gap-3">
                <UiToggleGroup v-model="controlMode" :options="controlModeOptions" />
                <UiButton variant="ghost" @click="openWizard">
                    <svg-icon type="mdi" :path="mdiAutoFix" :size="16" />
                    {{ t('layout.shell.coolingPage.guidedSetup') }}
                </UiButton>
                <ChannelExtensionSettings
                    ref="extensionSettingsRef"
                    :device-u-i-d="deviceUID"
                    :channel-name="channelName"
                    :chosen-profile="controlMode === 'automatic' ? selectedProfile : undefined"
                />
                <UiButton
                    class="ml-auto"
                    :class="{ 'animate-pulse-fast': editorDirty }"
                    :disabled="!canApply"
                    @click="apply"
                >
                    {{ t('layout.shell.coolingPage.apply') }}
                </UiButton>
            </div>

            <!-- Manual -->
            <div v-if="controlMode === 'manual'" class="flex flex-col gap-4">
                <div class="flex items-center gap-4">
                    <UiSlider
                        v-model="manualDuty"
                        :min="speedOptions?.min_duty ?? 0"
                        :max="speedOptions?.max_duty ?? 100"
                        class="max-w-md"
                    />
                    <span class="w-12 text-right tabular-nums text-text-color">
                        {{ manualDuty }}%
                    </span>
                </div>
                <SpeedFixedChart
                    :duty="manualDuty"
                    :current-device-u-i-d="deviceUID"
                    :current-sensor-name="channelName"
                />
            </div>

            <!-- Unmanaged -->
            <div v-else-if="controlMode === 'unmanaged'" class="flex flex-col gap-4">
                <p class="max-w-xl text-sm text-text-color-secondary">
                    {{ t('layout.shell.coolingPage.unmanagedHint') }}
                </p>
                <SpeedFixedChart
                    :default-profile="true"
                    :current-device-u-i-d="deviceUID"
                    :current-sensor-name="channelName"
                />
            </div>

            <!-- Profile -->
            <div v-else class="flex flex-col gap-4">
                <div
                    ref="profileSection"
                    class="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-lg border border-border-one p-3"
                >
                    <div class="flex flex-col gap-1">
                        <span class="text-xs text-text-color-secondary">
                            {{ t('layout.shell.coolingPage.chain.profile') }}
                        </span>
                        <UiSelect
                            v-model="selectedProfileUID"
                            :options="profileOptions"
                            :placeholder="t('layout.shell.coolingPage.selectProfile')"
                        />
                    </div>
                    <div
                        v-if="sharedChannels.length > 0"
                        class="flex items-center gap-2 self-center"
                    >
                        <span
                            class="inline-flex items-center gap-1.5 rounded-full border border-border-one bg-bg-two px-2.5 py-1 text-xs text-text-color-secondary"
                            :title="t('layout.shell.coolingPage.sharedTooltip')"
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

                <div
                    v-if="selectedProfileUID != null"
                    ref="editorSection"
                    class="rounded-lg border border-border-one"
                >
                    <ProfileEditor
                        ref="editorRef"
                        :key="selectedProfileUID"
                        :profile-u-i-d="selectedProfileUID"
                        graph-height="clamp(30rem, calc(100vh - 26rem), 44rem)"
                        hide-save
                    />
                </div>
            </div>
        </template>
        <p v-else class="text-sm text-text-color-secondary">
            {{ t('layout.shell.coolingPage.notControllable') }}
        </p>

        <UiSeparator />
        <div class="shrink-0" style="--time-chart-height: 24rem">
            <TimeChart :dashboard="channelDashboard" />
        </div>
    </div>
</template>
