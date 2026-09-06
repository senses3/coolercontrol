<!--
  SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import UiButton from '@/shell/ui/UiButton.vue'
import { UID } from '@/models/Device.ts'
import { useRouter } from 'vue-router'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { useI18n } from 'vue-i18n'
import { DeviceSettingWriteProfileDTO } from '@/models/DaemonSettings.ts'
import { v4 as uuidV4 } from 'uuid'
import {
    mdiButtonCursor,
    mdiEyeArrowRightOutline,
    mdiFlaskOutline,
    mdiChartTimelineVariant,
    mdiGauge,
    mdiPlusBoxOutline,
    mdiRestore,
} from '@mdi/js'

interface Props {
    deviceUID: UID
    channelName: string
    selectedProfileUID?: UID
    isControlView: boolean
    isControlFlowView?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
    (e: 'nextStep', step: number): void
    (e: 'close'): void
}>()
const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const router = useRouter()

// const selectedProfileName: string =
//     settingsStore.profiles.find((profile) => profile.uid === props.selectedProfileUID)?.name ??
//     'Unknown'
// const currentProfileMessage: string = `${t('components.wizards.fanControl.editCurrentProfile')}: "${selectedProfileName}"`
const currentProfileMessage: string = t('components.wizards.fanControl.editCurrentProfile')
const profilesLength: number = settingsStore.profiles.length

const selectedFunctionUID: UID =
    settingsStore.profiles.find((profile) => profile.uid === props.selectedProfileUID)
        ?.function_uid ?? '0'
// const selectedFunctionName: string =
//     settingsStore.functions.find((fun) => fun.uid === selectedFunctionUID)?.name ?? 'Unknown'
// const currentFunctionMessage: string = `${t('components.wizards.fanControl.editCurrentFunction')}: "${selectedFunctionName}"`
const currentFunctionMessage: string = t('components.wizards.fanControl.editCurrentFunction')

const redirectProfileAndClose = () => {
    router.push({ name: 'profiles', params: { profileUID: props.selectedProfileUID } })
    emit('close')
}
const redirectFunctionAndClose = () => {
    router.push({ name: 'functions', params: { functionUID: selectedFunctionUID } })
    emit('close')
}
const redirectSpeedViewAndClose = () => {
    router.push({
        name: 'device-speed',
        params: { deviceUID: props.deviceUID, channelName: props.channelName },
    })
    emit('close')
}
const resetSettings = async (): Promise<void> => {
    const setting = new DeviceSettingWriteProfileDTO('0')
    await settingsStore.saveDaemonDeviceSettingProfile(props.deviceUID, props.channelName, setting)
    if (!props.isControlView && !props.isControlFlowView) {
        // Only redirect if we are not on the control view or control flow view
        await router.push({
            name: 'device-speed',
            params: { deviceUID: props.deviceUID, channelName: props.channelName },
            query: { key: uuidV4() },
        })
    }
    emit('close')
}
const channelLabel =
    settingsStore.allUIDeviceSettings
        .get(props.deviceUID)
        ?.sensorsAndChannels.get(props.channelName)?.name ?? props.channelName

// Non-controllable channels should never make it to this wizard
</script>

<template>
    <div class="flex flex-col justify-between min-w-96 w-[40vw] h-[40vh] min-h-max">
        <div class="flex flex-col gap-y-4">
            <p class="my-2 text-center text-lg">
                <span class="font-bold">{{ channelLabel }}</span>
            </p>
            <div class="mt-0 flex flex-col place-items-center gap-y-3">
                <UiButton
                    v-if="isControlView && !props.isControlFlowView"
                    variant="ghost"
                    class="!p-2 bg-bg-one w-full !justify-start"
                    @click="redirectSpeedViewAndClose"
                >
                    <div class="flex flex-row font-semibold items-center">
                        <svg-icon
                            class="outline-0 mr-2"
                            type="mdi"
                            :path="mdiEyeArrowRightOutline"
                            :size="deviceStore.getREMSize(1.5)"
                        />
                        {{ t('components.wizards.fanControl.currentSettings') }}
                    </div>
                </UiButton>
                <div
                    v-if="
                        !props.isControlFlowView &&
                        props.selectedProfileUID !== undefined &&
                        props.selectedProfileUID !== '0'
                    "
                    class="flex flex-row w-full gap-x-3"
                >
                    <UiButton
                        v-if="
                            props.selectedProfileUID !== undefined &&
                            props.selectedProfileUID !== '0'
                        "
                        variant="ghost"
                        class="!p-2 bg-bg-one w-full !justify-start"
                        @click="redirectProfileAndClose"
                    >
                        <div class="flex flex-row font-semibold items-center">
                            <svg-icon
                                class="outline-0 mr-2"
                                type="mdi"
                                :path="mdiChartTimelineVariant"
                                :size="deviceStore.getREMSize(1.5)"
                            />
                            {{ currentProfileMessage }}
                        </div>
                    </UiButton>
                    <UiButton
                        v-if="selectedFunctionUID !== '0'"
                        variant="ghost"
                        class="!p-2 bg-bg-one w-full !justify-start"
                        @click="redirectFunctionAndClose"
                    >
                        <div class="flex flex-row font-semibold items-center">
                            <svg-icon
                                class="outline-0 mr-2"
                                type="mdi"
                                :path="mdiFlaskOutline"
                                :size="deviceStore.getREMSize(1.5)"
                            />
                            {{ currentFunctionMessage }}
                        </div>
                    </UiButton>
                </div>
                <div class="flex flex-row w-full gap-x-3">
                    <UiButton
                        v-if="profilesLength > 1"
                        variant="ghost"
                        class="!p-2 bg-bg-one w-full !justify-start"
                        @click="emit('nextStep', 2)"
                    >
                        <div class="flex flex-row font-semibold items-center">
                            <svg-icon
                                class="outline-0 mr-2"
                                type="mdi"
                                :path="mdiButtonCursor"
                                :size="deviceStore.getREMSize(1.5)"
                            />
                            {{ t('components.wizards.fanControl.existingProfile') }}
                        </div>
                    </UiButton>
                    <UiButton
                        variant="ghost"
                        class="!p-2 bg-bg-one w-full !justify-start"
                        @click="emit('nextStep', 3)"
                    >
                        <div class="flex flex-row font-semibold items-center">
                            <svg-icon
                                class="outline-0 mr-2"
                                type="mdi"
                                :path="mdiPlusBoxOutline"
                                :size="deviceStore.getREMSize(1.5)"
                            />
                            {{ t('components.wizards.fanControl.createNewProfile') }}
                        </div>
                    </UiButton>
                </div>
                <UiButton
                    variant="ghost"
                    class="!p-2 bg-bg-one w-full !justify-start"
                    @click="emit('nextStep', 4)"
                >
                    <div class="flex flex-row font-semibold items-center">
                        <svg-icon
                            class="outline-0 mr-2"
                            type="mdi"
                            :path="mdiGauge"
                            :size="deviceStore.getREMSize(1.5)"
                        />
                        {{ t('components.wizards.fanControl.manualSpeed') }}
                    </div>
                </UiButton>
                <UiButton
                    v-if="props.selectedProfileUID == null || props.selectedProfileUID !== '0'"
                    variant="ghost"
                    class="!p-2 bg-bg-one w-full !justify-start"
                    @click="resetSettings"
                >
                    <div class="flex flex-row font-semibold items-center">
                        <svg-icon
                            class="outline-0 mr-2"
                            type="mdi"
                            :path="mdiRestore"
                            :size="deviceStore.getREMSize(1.5)"
                        />
                        {{ t('components.wizards.fanControl.resetSettings') }}
                    </div>
                </UiButton>
            </div>
        </div>

        <div class="flex flex-row justify-between mt-4">
            <UiButton variant="ghost" class="w-24 bg-bg-one" @click="emit('close')">
                {{ t('common.cancel') }}
            </UiButton>
        </div>
    </div>
</template>

<style scoped lang="scss"></style>
