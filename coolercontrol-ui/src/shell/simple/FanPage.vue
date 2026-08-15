<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiSourceFork } from '@mdi/js'
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from '@/shell/confirm'
import { useCalibrationConversion } from '@/composables/useCalibrationConversion.ts'
import EntityTitleRename from '@/components/EntityTitleRename.vue'
import HealthWarning from '@/components/HealthWarning.vue'
import SpeedFixedChart from '@/components/SpeedFixedChart.vue'
import ChannelVerdictNotice from '@/shell/cooling/ChannelVerdictNotice.vue'
import { useChannelControl } from '@/shell/cooling/useChannelControl.ts'
import { fitProfileName } from '@/shell/cooling/profileNames.ts'
import { defaultGraphCurve } from '@/shell/cooling/defaultCurve.ts'
import { curveOwnership, findOwnCurve, seedTempSource } from '@/shell/simple/simpleCurve.ts'
import { DeviceSettingWriteProfileDTO } from '@/models/DaemonSettings.ts'
import type { UID } from '@/models/Device.ts'
import { Profile, ProfileType } from '@/models/Profile.ts'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import UiButton from '@/shell/ui/UiButton.vue'
import UiNumberInput from '@/shell/ui/UiNumberInput.vue'
import UiSlider from '@/shell/ui/UiSlider.vue'
import UiToggleGroup from '@/shell/ui/UiToggleGroup.vue'

// The full profile editor, embedded as a plain curve editor (graph only).
const ProfileEditor = defineAsyncComponent(() => import('@/views/ProfileView.vue'))

const props = defineProps<{ deviceUID: UID; channelName: string }>()

const { t } = useI18n()
const confirm = useConfirm()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()

const {
    speedOptions,
    controllable,
    channelLabel,
    defaultLabel,
    deviceLabel,
    saveChannelName,
    liveDuty,
    liveRpm,
    controlMode,
    manualDuty,
    selectedProfileUID,
    selectedProfile,
    sharedChannels,
    applying,
    editorRef,
    editorDirty,
    canApply,
    apply,
} = useChannelControl(props.deviceUID, props.channelName)

const controlModeOptions = computed(() => [
    { label: t('layout.shell.simple.modeCurve'), value: 'automatic' },
    { label: t('layout.shell.simple.modeFixed'), value: 'manual' },
    { label: t('common.unmanaged'), value: 'unmanaged' },
])

const ownership = computed(() => curveOwnership(selectedProfile.value, sharedChannels.value.length))

// The name a curve made here carries, and so how one made here earlier is found
// again. The suffix carries its own leading separator, for locales to word.
const ownCurveName = computed(() =>
    fitProfileName(channelLabel.value, t('layout.shell.simple.curveNameSuffix')),
)

// Turning a fan back to a curve picks up the one it had, rather than asking for
// another: a fixed speed drops the assignment, and there is no picker here to
// put it back. Nothing is written until Apply.
watch(controlMode, (mode) => {
    if (mode !== 'automatic' || selectedProfileUID.value != null) return
    const own = findOwnCurve(settingsStore.profiles, ownCurveName.value)
    if (own != null) selectedProfileUID.value = own.uid
})

const conversion = useCalibrationConversion(
    props.deviceUID,
    props.channelName,
    () => channelLabel.value,
)

const confirmAction = async (message: string): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
        confirm.require({
            header: t('layout.shell.simple.useCurve'),
            message,
            acceptLabel: t('layout.shell.simple.useCurveAccept'),
            rejectLabel: t('common.cancel'),
            defaultFocus: 'reject',
            accept: () => resolve(true),
            reject: () => resolve(false),
        })
    })

const busy = ref(false)

/**
 * Gives this fan a curve of its own. A shared curve is copied so the fans that
 * share it keep theirs; anything else starts from the speed the fan holds now.
 * Always confirmed first: both paths change what drives the fan.
 */
const useSimpleCurve = async (): Promise<void> => {
    if (busy.value) return
    const source = selectedProfile.value
    const shared = ownership.value === 'shared' && source != null
    const message = shared
        ? t('layout.shell.simple.forkMessage', {
              channel: channelLabel.value,
              copy: conversion.forkName(source.name),
          })
        : t('layout.shell.simple.seedMessage', { channel: channelLabel.value })
    if (!(await confirmAction(message))) return
    busy.value = true
    try {
        const profile = shared ? await conversion.forkProfile(source) : await createSeededCurve()
        if (profile == null) return
        selectedProfileUID.value = profile.uid
        controlMode.value = 'automatic'
    } finally {
        busy.value = false
    }
}

/**
 * A new Graph profile on the curve a new profile always starts from, so a fan
 * set up here and a fan set up in the full interface begin identically. The
 * temp range is clamped the way the editor clamps its axis, or the curve it
 * draws on open would not be the curve that was saved.
 */
const createSeededCurve = async (): Promise<Profile | undefined> => {
    const tempSource = seedTempSource(
        deviceStore.allDevices(),
        props.deviceUID,
        selectedProfile.value?.temp_source,
    )
    if (tempSource == null) return undefined
    const info = [...deviceStore.allDevices()].find(
        (device) => device.uid === tempSource.device_uid,
    )?.info
    if (info == null) return undefined
    const profile = new Profile(
        ownCurveName.value,
        ProfileType.Graph,
        undefined,
        tempSource,
        defaultGraphCurve(
            Math.max(info.temp_min, 0),
            Math.min(info.temp_max, 100),
            info.profile_min_length,
            info.profile_max_length,
        ),
    )
    settingsStore.profiles.push(profile)
    if (!(await settingsStore.saveProfile(profile.uid))) {
        // Drop the phantom so nothing offers an unsaved profile.
        settingsStore.profiles.splice(settingsStore.profiles.indexOf(profile), 1)
        return undefined
    }
    await settingsStore.saveDaemonDeviceSettingProfile(
        props.deviceUID,
        props.channelName,
        new DeviceSettingWriteProfileDTO(profile.uid),
    )
    return profile
}

// Chart canvases consume plain wheel events for zoom; stop them in the capture
// phase so the page scrolls. Ctrl+wheel (and trackpad pinch) passes through.
const onPageWheelCapture = (event: WheelEvent): void => {
    if (!event.ctrlKey) event.stopPropagation()
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

        <template v-if="controllable">
            <div class="flex flex-wrap items-center gap-3">
                <UiToggleGroup v-model="controlMode" :options="controlModeOptions" />
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

            <!-- Fixed speed -->
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

            <!-- Curve: edited in place only when this fan owns it. -->
            <div v-else-if="ownership === 'owned' && selectedProfileUID != null">
                <div class="rounded-lg border border-border-one">
                    <ProfileEditor
                        :ref="editorRef"
                        :key="selectedProfileUID"
                        :profile-u-i-d="selectedProfileUID"
                        :channel-device-u-i-d="deviceUID"
                        :channel-name="channelName"
                        graph-height="clamp(30rem, calc(100vh - 24rem), 44rem)"
                        hide-save
                        graph-only
                    />
                </div>
            </div>
            <div v-else class="flex flex-col gap-3 rounded-lg border border-border-one p-3">
                <p class="max-w-xl text-base text-text-color-secondary">
                    {{
                        ownership === 'shared'
                            ? t('layout.shell.simple.sharedSummary', sharedChannels.length)
                            : ownership === 'unsupported'
                              ? t('layout.shell.simple.otherSummary', {
                                    profile: selectedProfile?.name,
                                })
                              : t('layout.shell.simple.noCurveSummary')
                    }}
                </p>
                <UiButton class="self-start" :disabled="busy || applying" @click="useSimpleCurve">
                    <svg-icon type="mdi" :path="mdiSourceFork" :size="14" />
                    {{ t('layout.shell.simple.useCurve') }}
                </UiButton>
            </div>
        </template>
        <ChannelVerdictNotice v-else :device-u-i-d="deviceUID" :channel-name="channelName" />
    </div>
</template>
