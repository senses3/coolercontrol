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
    mdiBookmarkCheckOutline,
    mdiContentDuplicate,
    mdiDeleteOutline,
    mdiInformationSlabCircleOutline,
    mdiMemory,
    mdiMinusThick,
    mdiUpdate,
} from '@mdi/js'
import { useSettingsStore } from '@/stores/SettingsStore'
import { computed, inject, onMounted, type Ref, ref, watch } from 'vue'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { Mode } from '@/models/Mode.ts'
import { UID } from '@/models/Device.ts'
import { DeviceSettingReadDTO } from '@/models/DaemonSettings.ts'
import { getProfileDisplayName } from '@/models/Profile.ts'
import UiButton from '@/shell/ui/UiButton.vue'
import UiTable from '@/shell/ui/UiTable.vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import EntityTitleRename from '@/components/EntityTitleRename.vue'
import { Emitter, EventType } from 'mitt'

interface Props {
    modeUID: UID
}

const props = defineProps<Props>()
const { t } = useI18n()
const emitter: Emitter<Record<EventType, any>> = inject('emitter')!

const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()

const currentMode: Ref<Mode> = computed(
    () => settingsStore.modes.find((mode) => mode.uid === props.modeUID)!,
)
const deviceTableData: Ref<Array<DeviceData>> = ref([])

interface DeviceData {
    rowID: string
    deviceUID: string
    deviceName: string
    channelID: string
    channelColor: string
    channelLabel: string
    settingType: string
    settingInfo: string
}

// First row of each device group carries the device cell, spanning the group.
const isFirstOfDevice = (idx: number): boolean =>
    idx === 0 || deviceTableData.value[idx - 1].deviceUID !== deviceTableData.value[idx].deviceUID
const deviceRowSpan = (idx: number): number => {
    let span = 1
    for (let i = idx + 1; i < deviceTableData.value.length; i++) {
        if (deviceTableData.value[i].deviceUID !== deviceTableData.value[idx].deviceUID) break
        span++
    }
    return span
}

const initTableData = () => {
    deviceTableData.value.length = 0
    const modeSettings: Map<UID, Map<string, DeviceSettingReadDTO>> = new Map()
    for (const [deviceUID, settings] of currentMode.value.device_settings) {
        const channelSettings = new Map()
        for (const setting of settings) {
            channelSettings.set(setting.channel_name, setting)
        }
        modeSettings.set(deviceUID, channelSettings)
    }

    for (const device of deviceStore.allDevices()) {
        const deviceSettings = settingsStore.allUIDeviceSettings.get(device.uid)
        if (deviceSettings == null || device.info == null) {
            continue
        }
        // Devices and Channels have been pre-sorted, unlike mode device settings.
        for (const [channelName, channelInfo] of device.info.channels.entries()) {
            const channelSettings = deviceSettings.sensorsAndChannels.get(channelName)
            if (channelSettings == null) {
                continue
            }
            const channelModeSetting = modeSettings.get(device.uid)?.get(channelName)
            let settingType = 'Unknown'
            let settingInfo: string = 'Unknown'
            if (channelInfo.speed_options != null) {
                if (channelModeSetting == null) {
                    // This means there doesn't exist a setting for this channel.
                    continue
                    // info = 'Default Profile'
                    // Displaying 'null' as a Default Profile is an issue if one mode has a
                    // setting for a channel and another mode doesn't. Then switching won't set
                    //  it back to 'default'. By not displaying the setting, as least we are
                    // indicating to the user that there is no setting for this channel.
                } else if (channelModeSetting.speed_fixed != null) {
                    settingType = 'Manual'
                    settingInfo = `${channelModeSetting.speed_fixed}%`
                } else if (channelModeSetting.profile_uid != null) {
                    settingType = 'Profile'
                    const profile = settingsStore.profiles.find(
                        (p) => p.uid === channelModeSetting.profile_uid,
                    )
                    settingInfo =
                        profile != null
                            ? getProfileDisplayName(profile)
                            : channelModeSetting.profile_uid === '0'
                              ? t('common.unmanaged')
                              : 'Unknown'
                }
            } else if (channelInfo.lighting_modes.length > 0) {
                if (channelModeSetting == null) {
                    continue
                    // info = 'Lighting Mode: None'
                } else {
                    settingType = 'Lighting Mode'
                    settingInfo = `${
                        channelModeSetting.lighting?.mode ?? 'Unknown'
                    } ; Colors: ${channelModeSetting.lighting?.colors.length ?? 'Unknown'}`
                }
            } else if (channelInfo.lcd_info != null) {
                if (channelModeSetting == null) {
                    continue
                    // info = 'LCD Mode: None'
                } else {
                    settingType = 'LCD Mode'
                    settingInfo = channelModeSetting.lcd?.mode ?? 'Unknown'
                }
            } else {
                // Then this channel is not controllable. i.e. Load or Freq.
                continue
            }
            deviceTableData.value.push({
                rowID: `${device.uid}-${channelName}`,
                deviceUID: device.uid,
                deviceName: device.name,
                channelID: channelName,
                channelColor: channelSettings.color,
                channelLabel: channelSettings.name,
                settingType: settingType,
                settingInfo: settingInfo,
            })
        }
    }
}
initTableData()

const isActivated = false
const activateMode = async (): Promise<void> => {
    await settingsStore.activateMode(props.modeUID)
}

const saveNameFunction = async (newName: string): Promise<boolean> => {
    if (newName.length > 0) {
        const successful = await settingsStore.updateModeName(currentMode.value.uid, newName)
        if (successful) {
            currentMode.value.name = newName
            emitter.emit('mode-name-update', { modeUID: currentMode.value.uid, name: newName })
            return true
        } else {
            return false
        }
    }
    return false
}

onMounted(async () => {
    watch(settingsStore.allUIDeviceSettings, () => {
        initTableData()
    })
})

const router = useRouter()
const confirm = useConfirm()

const updateModeWithCurrentSettings = (): void => {
    confirm.require({
        message: t('views.modes.updateModeConfirm', { name: currentMode.value.name }),
        header: t('views.modes.editMode'),
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            await settingsStore.updateModeSettings(currentMode.value.uid)
        },
    })
}

const duplicateMode = async (): Promise<void> => {
    const newMode = await settingsStore.duplicateMode(currentMode.value.uid)
    if (newMode != null) {
        await router.push({ name: 'modes', params: { modeUID: newMode.uid } })
    }
}

const deleteMode = (): void => {
    confirm.require({
        message: t('views.modes.deleteModeConfirm', { name: currentMode.value.name }),
        header: t('views.modes.deleteMode'),
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            await settingsStore.deleteMode(currentMode.value.uid)
            await router.push({ name: 'cooling-modes' })
        },
    })
}
</script>

<template>
    <div class="flex h-[3.6rem] border-b-4 border-border-one items-center justify-between">
        <div class="flex flex-row overflow-hidden">
            <entity-title-rename
                :current-name="currentMode.name"
                :save-name-function="saveNameFunction"
            />
            <div
                class="px-4 py-2 flex flex-row leading-none items-center"
                v-tooltip.top="t('views.mode.modeHint')"
            >
                <svg-icon
                    type="mdi"
                    :path="mdiInformationSlabCircleOutline"
                    :size="deviceStore.getREMSize(1.25)"
                />
            </div>
        </div>
        <div class="flex flex-row items-center">
            <div
                class="p-2 flex leading-none items-center cursor-pointer"
                v-tooltip.top="t('views.modes.editMode')"
                @click="updateModeWithCurrentSettings"
            >
                <svg-icon type="mdi" :path="mdiUpdate" :size="deviceStore.getREMSize(1.25)" />
            </div>
            <div
                class="p-2 flex leading-none items-center cursor-pointer"
                v-tooltip.top="t('views.modes.duplicateMode')"
                @click="duplicateMode"
            >
                <svg-icon
                    type="mdi"
                    :path="mdiContentDuplicate"
                    :size="deviceStore.getREMSize(1.25)"
                />
            </div>
            <div
                class="p-2 flex leading-none items-center cursor-pointer"
                v-tooltip.top="t('views.modes.deleteMode')"
                @click="deleteMode"
            >
                <svg-icon
                    type="mdi"
                    :path="mdiDeleteOutline"
                    :size="deviceStore.getREMSize(1.25)"
                />
            </div>
            <div
                class="p-2"
                v-tooltip.top="{ value: t('views.mode.currentlyActive'), disabled: !isActivated }"
            >
                <UiButton
                    class="w-32"
                    v-tooltip.top="t('views.mode.activateMode')"
                    :disabled="isActivated"
                    @click="activateMode"
                >
                    <svg-icon
                        class="outline-0"
                        type="mdi"
                        :path="mdiBookmarkCheckOutline"
                        :size="deviceStore.getREMSize(1.5)"
                    />
                </UiButton>
            </div>
        </div>
    </div>
    <div class="h-full overflow-y-auto pb-14">
        <UiTable sticky-header>
            <template #head>
                <tr>
                    <th>{{ t('components.sensorTable.device') }}</th>
                    <th>{{ t('components.sensorTable.channel') }}</th>
                    <th>{{ t('components.modeTable.setting') }}</th>
                    <th></th>
                </tr>
            </template>
            <tr v-for="(row, idx) in deviceTableData" :key="row.rowID">
                <td v-if="isFirstOfDevice(idx)" :rowspan="deviceRowSpan(idx)" class="align-top">
                    <div class="flex leading-none items-center">
                        <svg-icon
                            type="mdi"
                            :path="mdiMemory"
                            :size="deviceStore.getREMSize(1.3)"
                            class="mr-2"
                        />
                        {{ row.deviceName }}
                    </div>
                </td>
                <td>
                    <div class="flex items-center gap-2">
                        <svg-icon
                            type="mdi"
                            :path="mdiMinusThick"
                            :size="14"
                            class="shrink-0"
                            :style="{ color: row.channelColor }"
                        />
                        {{ row.channelLabel }}
                    </div>
                </td>
                <td>{{ row.settingType }}</td>
                <td>{{ row.settingInfo }}</td>
            </tr>
        </UiTable>
    </div>
</template>

<style scoped lang="scss"></style>
