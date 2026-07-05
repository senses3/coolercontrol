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
import { mdiAutoFix, mdiShareVariantOutline } from '@mdi/js'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { storeToRefs } from 'pinia'
import { v4 as uuidV4 } from 'uuid'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChannelExtensionSettings from '@/components/ChannelExtensionSettings.vue'
import HealthWarning from '@/components/HealthWarning.vue'
import MixProfileEditorChart from '@/components/MixProfileEditorChart.vue'
import OverlayProfileEditorChart from '@/components/OverlayProfileEditorChart.vue'
import SpeedFixedChart from '@/components/SpeedFixedChart.vue'
import TimeChart from '@/components/TimeChart.vue'
import { useFanControlWizard } from '@/composables/useFanControlWizard.ts'
import { Dashboard, DashboardDeviceChannel } from '@/models/Dashboard.ts'
import {
    DeviceSettingWriteManualDTO,
    DeviceSettingWriteProfileDTO,
} from '@/models/DaemonSettings.ts'
import type { Device, UID } from '@/models/Device.ts'
import {
    Profile,
    ProfileMixFunctionType,
    ProfileTempSource,
    ProfileType,
    getProfileMixFunctionTypeDisplayName,
} from '@/models/Profile.ts'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import ChainStrip, { type ChainPill } from '@/shell/cooling/ChainStrip.vue'
import GraphProfileEditor, { type GraphTempSource } from '@/shell/cooling/GraphProfileEditor.vue'
import UiButton from '@/shell/ui/UiButton.vue'
import UiCollapsible from '@/shell/ui/UiCollapsible.vue'
import UiSelect, { type UiSelectOption } from '@/shell/ui/UiSelect.vue'
import UiSeparator from '@/shell/ui/UiSeparator.vue'
import UiSlider from '@/shell/ui/UiSlider.vue'
import UiToggleGroup from '@/shell/ui/UiToggleGroup.vue'

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

// ----- edited profile copy -----
const cloneProfile = (profile: Profile): Profile =>
    plainToInstance(Profile, instanceToPlain(profile))

const editedProfile = ref<Profile | undefined>()
const originalProfileJson = ref<string>('')
const resetEditedProfile = (): void => {
    const profile = settingsStore.profiles.find((p) => p.uid === selectedProfileUID.value)
    editedProfile.value = profile != null ? cloneProfile(profile) : undefined
    originalProfileJson.value = profile != null ? JSON.stringify(instanceToPlain(profile)) : ''
}
resetEditedProfile()
watch(selectedProfileUID, resetEditedProfile)

const profileDirty = computed<boolean>(() => {
    if (editedProfile.value == null) return false
    return JSON.stringify(instanceToPlain(editedProfile.value)) !== originalProfileJson.value
})

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
const shareMode = ref<'all' | 'fork'>('all')
const shareOptions = computed(() => [
    {
        label: t('layout.shell.coolingPage.updateAll', { count: sharedChannels.value.length + 1 }),
        value: 'all',
    },
    { label: t('layout.shell.coolingPage.forkForFan'), value: 'fork' },
])

// ----- select options -----
const profileOptions = computed<UiSelectOption[]>(() =>
    settingsStore.profiles
        .filter((profile) => profile.uid !== '0')
        .map((profile) => ({ label: profile.name, value: profile.uid })),
)
const functionOptions = computed<UiSelectOption[]>(() =>
    settingsStore.functions.map((fun) => ({ label: fun.name, value: fun.uid })),
)
const mixFunctionOptions = computed<UiSelectOption[]>(() =>
    Object.values(ProfileMixFunctionType).map((mixType) => ({
        label: getProfileMixFunctionTypeDisplayName(mixType),
        value: mixType,
    })),
)

interface TempOption extends UiSelectOption {
    deviceUID: UID
    tempName: string
}
const tempSourceOptions = computed<TempOption[]>(() => {
    const options: TempOption[] = []
    for (const dev of deviceStore.allDevices()) {
        if (dev.info == null || dev.status.temps.length === 0) continue
        const deviceSettings = settingsStore.allUIDeviceSettings.get(dev.uid)
        const devName = deviceSettings?.name ?? dev.uid
        for (const temp of dev.status.temps) {
            const label = deviceSettings?.sensorsAndChannels.get(temp.name)?.name ?? temp.name
            options.push({
                label: `${devName}: ${label}`,
                value: `${dev.uid}/${temp.name}`,
                deviceUID: dev.uid,
                tempName: temp.name,
            })
        }
    }
    return options
})

const selectedTempValue = computed<string | undefined>({
    get: () =>
        editedProfile.value?.temp_source != null
            ? `${editedProfile.value.temp_source.device_uid}/${editedProfile.value.temp_source.temp_name}`
            : undefined,
    set: (value) => {
        if (editedProfile.value == null || value == null) return
        const option = tempSourceOptions.value.find((o) => o.value === value)
        if (option == null) return
        editedProfile.value.temp_source = new ProfileTempSource(option.tempName, option.deviceUID)
    },
})

const graphTempSource = computed<GraphTempSource | undefined>(() => {
    const source = editedProfile.value?.temp_source
    if (source == null) return undefined
    let sourceDevice: Device | undefined
    for (const candidate of deviceStore.allDevices()) {
        if (candidate.uid === source.device_uid) {
            sourceDevice = candidate
            break
        }
    }
    return {
        deviceUID: source.device_uid,
        tempName: source.temp_name,
        color:
            settingsStore.allUIDeviceSettings
                .get(source.device_uid)
                ?.sensorsAndChannels.get(source.temp_name)?.color ?? '',
        tempMin: sourceDevice?.info?.temp_min ?? 0,
        tempMax: sourceDevice?.info?.temp_max ?? 100,
    }
})

const graphPointLimits = computed(() => {
    const source = editedProfile.value?.temp_source
    let sourceDevice: Device | undefined
    if (source != null) {
        for (const candidate of deviceStore.allDevices()) {
            if (candidate.uid === source.device_uid) {
                sourceDevice = candidate
                break
            }
        }
    }
    return {
        min: sourceDevice?.info?.profile_min_length ?? 2,
        max: sourceDevice?.info?.profile_max_length ?? 17,
    }
})

const onGraphChanged = (points: Array<[number, number]>): void => {
    if (editedProfile.value == null) return
    editedProfile.value.speed_profile = points
}
const onOverlayChanged = (points: Array<[number, number]>): void => {
    if (editedProfile.value == null) return
    editedProfile.value.offset_profile = points
}

const memberProfiles = computed<Profile[]>(
    () =>
        (editedProfile.value?.member_profile_uids ?? [])
            .map((uid) => settingsStore.profiles.find((p) => p.uid === uid))
            .filter((p) => p != null) as Profile[],
)
const memberCandidates = computed<Profile[]>(() =>
    settingsStore.profiles.filter(
        (profile) => profile.uid !== '0' && profile.uid !== editedProfile.value?.uid,
    ),
)
const toggleMember = (uid: UID): void => {
    if (editedProfile.value == null) return
    const members = editedProfile.value.member_profile_uids
    editedProfile.value.member_profile_uids = members.includes(uid)
        ? members.filter((member) => member !== uid)
        : [...members, uid]
}

const overlayBaseUID = computed<string | undefined>({
    get: () => editedProfile.value?.member_profile_uids[0],
    set: (value) => {
        if (editedProfile.value == null || value == null) return
        editedProfile.value.member_profile_uids = [value]
    },
})

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
    if (controlMode.value === 'unmanaged' || editedProfile.value == null) {
        return [{ kind: 'profile', label: t('common.unmanaged') }]
    }
    const pills: ChainPill[] = []
    const source = editedProfile.value.temp_source
    if (source != null) {
        const label =
            settingsStore.allUIDeviceSettings
                .get(source.device_uid)
                ?.sensorsAndChannels.get(source.temp_name)?.name ?? source.temp_name
        pills.push({ kind: 'tempSource', label })
    }
    pills.push({ kind: 'profile', label: editedProfile.value.name })
    const fun = settingsStore.functions.find(
        (candidate) => candidate.uid === editedProfile.value?.function_uid,
    )
    if (fun != null && fun.uid !== '0') {
        pills.push({ kind: 'function', label: fun.name })
    }
    return pills
})

const profileSection = ref<HTMLElement>()
const tempSection = ref<HTMLElement>()
const functionSection = ref<HTMLElement>()
const onPillClick = (kind: ChainPill['kind']): void => {
    const target =
        kind === 'tempSource'
            ? tempSection.value
            : kind === 'function'
              ? functionSection.value
              : profileSection.value
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

// ----- apply / save -----
const applying = ref(false)
const extensionSettingsRef = ref()

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
        return assignmentDirty.value || profileDirty.value
    }
    return assignmentDirty.value
})

const saveEditedProfile = async (): Promise<UID | undefined> => {
    if (editedProfile.value == null) return selectedProfileUID.value
    if (!profileDirty.value) return selectedProfileUID.value
    if (sharedChannels.value.length > 0 && shareMode.value === 'fork') {
        const forked = cloneProfile(editedProfile.value)
        forked.uid = uuidV4()
        forked.name = `${editedProfile.value.name} (${channelLabel.value})`
        settingsStore.profiles.push(forked)
        const saved = await settingsStore.saveProfile(forked.uid)
        if (!saved) return undefined
        return forked.uid
    }
    const index = settingsStore.profiles.findIndex(
        (profile) => profile.uid === editedProfile.value?.uid,
    )
    if (index < 0) return undefined
    settingsStore.profiles[index] = cloneProfile(editedProfile.value)
    const updated = await settingsStore.updateProfile(editedProfile.value.uid)
    if (!updated) return undefined
    return editedProfile.value.uid
}

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
        } else {
            const profileUID = await saveEditedProfile()
            if (profileUID == null) return
            await settingsStore.saveDaemonDeviceSettingProfile(
                props.deviceUID,
                props.channelName,
                new DeviceSettingWriteProfileDTO(profileUID),
            )
            selectedProfileUID.value = profileUID
            resetEditedProfile()
        }
        extensionSettingsRef.value?.saveChannelExtensionSettings?.()
    } finally {
        applying.value = false
    }
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
    <div class="flex h-full flex-col gap-4 overflow-y-auto p-4">
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
                <UiButton class="ml-auto" :disabled="!canApply" @click="apply">
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
                <div ref="profileSection" class="flex flex-wrap items-center gap-3">
                    <UiSelect
                        v-model="selectedProfileUID"
                        :options="profileOptions"
                        :placeholder="t('layout.shell.coolingPage.selectProfile')"
                    />
                    <div
                        v-if="sharedChannels.length > 0"
                        class="inline-flex items-center gap-1.5 rounded-full border border-border-one bg-bg-two px-2.5 py-1 text-xs text-text-color-secondary"
                        :title="t('layout.shell.coolingPage.sharedTooltip')"
                    >
                        <svg-icon type="mdi" :path="mdiShareVariantOutline" :size="13" />
                        {{
                            t('layout.shell.coolingPage.sharedWith', {
                                count: sharedChannels.length,
                            })
                        }}
                    </div>
                </div>

                <template v-if="editedProfile != null">
                    <div
                        v-if="profileDirty && sharedChannels.length > 0"
                        class="flex flex-wrap items-center gap-3 rounded-lg border border-warning/50 bg-bg-two p-3"
                    >
                        <span class="text-sm text-text-color">
                            {{ t('layout.shell.coolingPage.sharedEditPrompt') }}
                        </span>
                        <UiToggleGroup v-model="shareMode" :options="shareOptions" />
                    </div>

                    <!-- Fixed -->
                    <div
                        v-if="editedProfile.p_type === ProfileType.Fixed"
                        class="flex flex-col gap-4"
                    >
                        <div class="flex items-center gap-4">
                            <UiSlider
                                :model-value="editedProfile.speed_fixed ?? 50"
                                :min="speedOptions?.min_duty ?? 0"
                                :max="speedOptions?.max_duty ?? 100"
                                class="max-w-md"
                                @update:model-value="
                                    (duty: number) => (editedProfile!.speed_fixed = duty)
                                "
                            />
                            <span class="w-12 text-right tabular-nums text-text-color">
                                {{ editedProfile.speed_fixed ?? 50 }}%
                            </span>
                        </div>
                    </div>

                    <!-- Graph -->
                    <div
                        v-else-if="editedProfile.p_type === ProfileType.Graph"
                        class="flex flex-col gap-3"
                    >
                        <div ref="tempSection" class="flex flex-wrap items-center gap-3">
                            <span class="text-sm text-text-color-secondary">
                                {{ t('layout.shell.coolingPage.chain.tempSource') }}
                            </span>
                            <UiSelect
                                v-model="selectedTempValue"
                                :options="tempSourceOptions"
                                :placeholder="t('layout.shell.coolingPage.selectTempSource')"
                            />
                        </div>
                        <GraphProfileEditor
                            v-if="graphTempSource != null"
                            :points="editedProfile.speed_profile"
                            :temp-source="graphTempSource"
                            :duty-min="speedOptions?.min_duty ?? 0"
                            :duty-max="speedOptions?.max_duty ?? 100"
                            :min-points="graphPointLimits.min"
                            :max-points="graphPointLimits.max"
                            @changed="onGraphChanged"
                        />
                        <p v-else class="text-sm text-text-color-secondary">
                            {{ t('layout.shell.coolingPage.selectTempSourceHint') }}
                        </p>
                    </div>

                    <!-- Mix -->
                    <div
                        v-else-if="editedProfile.p_type === ProfileType.Mix"
                        class="flex flex-col gap-3"
                    >
                        <div class="flex flex-wrap items-center gap-3">
                            <span class="text-sm text-text-color-secondary">
                                {{ t('layout.shell.coolingPage.mixFunction') }}
                            </span>
                            <UiSelect
                                :model-value="editedProfile.mix_function_type"
                                :options="mixFunctionOptions"
                                @update:model-value="
                                    (mixType: string | undefined) =>
                                        (editedProfile!.mix_function_type =
                                            mixType as ProfileMixFunctionType)
                                "
                            />
                        </div>
                        <div class="flex flex-wrap gap-2">
                            <label
                                v-for="candidate in memberCandidates"
                                :key="candidate.uid"
                                class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-one bg-bg-two px-2.5 py-1 text-sm text-text-color hover:bg-surface-hover"
                            >
                                <input
                                    type="checkbox"
                                    :checked="
                                        editedProfile.member_profile_uids.includes(candidate.uid)
                                    "
                                    class="accent-accent"
                                    @change="toggleMember(candidate.uid)"
                                />
                                {{ candidate.name }}
                            </label>
                        </div>
                        <MixProfileEditorChart
                            v-if="
                                memberProfiles.length > 0 && editedProfile.mix_function_type != null
                            "
                            :profiles="memberProfiles"
                            :mix-function-type="editedProfile.mix_function_type"
                        />
                    </div>

                    <!-- Overlay -->
                    <div
                        v-else-if="editedProfile.p_type === ProfileType.Overlay"
                        class="flex flex-col gap-3"
                    >
                        <div class="flex flex-wrap items-center gap-3">
                            <span class="text-sm text-text-color-secondary">
                                {{ t('layout.shell.coolingPage.overlayBase') }}
                            </span>
                            <UiSelect
                                v-model="overlayBaseUID"
                                :options="
                                    profileOptions.filter((o) => o.value !== editedProfile!.uid)
                                "
                                :placeholder="t('layout.shell.coolingPage.selectProfile')"
                            />
                        </div>
                        <OverlayProfileEditorChart
                            :profile-u-i-d="editedProfile.uid"
                            @changed="onOverlayChanged"
                        />
                    </div>

                    <div ref="functionSection" class="flex flex-wrap items-center gap-3">
                        <span class="text-sm text-text-color-secondary">
                            {{ t('layout.shell.coolingPage.chain.function') }}
                        </span>
                        <UiSelect
                            :model-value="editedProfile.function_uid"
                            :options="functionOptions"
                            @update:model-value="
                                (uid: string | undefined) =>
                                    (editedProfile!.function_uid = uid ?? '0')
                            "
                        />
                        <RouterLink
                            v-if="editedProfile.function_uid !== '0'"
                            :to="{
                                name: 'functions',
                                params: { functionUID: editedProfile.function_uid },
                            }"
                            class="text-sm text-accent outline-none hover:underline"
                        >
                            {{ t('layout.shell.coolingPage.editFunction') }}
                        </RouterLink>
                    </div>
                </template>
            </div>
        </template>
        <p v-else class="text-sm text-text-color-secondary">
            {{ t('layout.shell.coolingPage.notControllable') }}
        </p>

        <UiSeparator />
        <TimeChart :dashboard="channelDashboard" class="min-h-72" />

        <UiCollapsible v-if="controllable" :title="t('layout.shell.coolingPage.advanced')">
            <div class="p-2">
                <ChannelExtensionSettings
                    ref="extensionSettingsRef"
                    :device-u-i-d="deviceUID"
                    :channel-name="channelName"
                />
            </div>
        </UiCollapsible>
    </div>
</template>
