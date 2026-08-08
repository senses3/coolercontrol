<!--
  SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon'
import { mdiArrowLeft, mdiContentSaveOutline } from '@mdi/js'
import UiButton from '@/shell/ui/UiButton.vue'
import UiNumberInput from '@/shell/ui/UiNumberInput.vue'
import UiSlider from '@/shell/ui/UiSlider.vue'
import { ref, Ref } from 'vue'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { UID } from '@/models/Device.ts'
import { DeviceSettingWriteManualDTO } from '@/models/DaemonSettings.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { v4 as uuidV4 } from 'uuid'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const router = useRouter()

interface Props {
    deviceUID: UID
    channelName: string
    isControlFlowView?: boolean
}

const emit = defineEmits<{
    (e: 'nextStep', step: number): void
    (e: 'close'): void
}>()
const props = defineProps<Props>()
const getCurrentDuty = (): number | undefined => {
    const duty = deviceStore.currentDeviceStatus.get(props.deviceUID)?.get(props.channelName)?.duty
    return duty != null ? Number(duty) : undefined
}
const manualDuty: Ref<number> = ref(getCurrentDuty() || 0)
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

const saveSetting = async () => {
    if (manualDuty.value == null) {
        return
    }
    const setting = new DeviceSettingWriteManualDTO(manualDuty.value)
    await settingsStore.saveDaemonDeviceSettingManual(props.deviceUID, props.channelName, setting)
    emit('close')
    if (!props.isControlFlowView) {
        await router.push({
            name: 'device-speed',
            params: { deviceUID: props.deviceUID, channelName: props.channelName },
            query: { key: uuidV4() },
        })
    }
}
</script>

<template>
    <div class="flex flex-col justify-between min-w-96 w-[40vw] min-h-max h-[40vh]">
        <div class="mt-4 flex flex-col">
            <div class="w-full ml-2 mb-1 text-sm">
                {{ t('components.wizards.fanControl.selectSpeed') }}:
            </div>
            <UiNumberInput
                v-model="manualDuty"
                class="self-start"
                :suffix="` ${t('common.percentUnit')}`"
                :min="dutyMin"
                :max="dutyMax"
                :step="1"
            />
            <div class="mx-1.5 mt-4 w-64">
                <UiSlider v-model="manualDuty" :step="1" :min="dutyMin" :max="dutyMax" />
            </div>
        </div>
        <div class="flex flex-row justify-between mt-4">
            <UiButton variant="ghost" class="w-24 bg-bg-one" @click="emit('nextStep', 1)">
                <svg-icon
                    class="outline-0"
                    type="mdi"
                    :path="mdiArrowLeft"
                    :size="deviceStore.getREMSize(1.5)"
                />
            </UiButton>
            <UiButton
                variant="solid"
                class="w-32"
                v-tooltip.top="t('views.speed.applySetting')"
                @click="saveSetting"
            >
                <svg-icon
                    class="outline-0"
                    type="mdi"
                    :path="mdiContentSaveOutline"
                    :size="deviceStore.getREMSize(1.5)"
                />
            </UiButton>
        </div>
    </div>
</template>

<style scoped lang="scss"></style>
