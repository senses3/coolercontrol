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
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { reactive, Reactive, ref } from 'vue'
import { ElTree } from 'element-plus'
import { DeviceType } from '@/models/Device.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { mdiHelpCircleOutline, mdiRestart } from '@mdi/js'
import TreeIcon from '@/components/TreeIcon.vue'
import Button from 'primevue/button'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { CoolerControlDeviceSettingsDTO } from '@/models/CCSettings.ts'
import { useI18n } from 'vue-i18n'

const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const confirm = useConfirm()
const toast = useToast()
const { t } = useI18n()

interface Tree {
    label: string
    children?: Tree[]
}

const treeRef = ref<InstanceType<typeof ElTree>>()
const nodeProps = {
    children: 'children',
    label: 'label',
}
const data: Reactive<Tree[]> = reactive([])
const defaultCheckedNodeIds: Array<string> = []

const createTreeMenu = (): void => {
    data.length = 0
    data.push(...devicesTreeArray())
}

const devicesTreeArray = (): any[] => {
    const allDevices = []
    // Disabled Devices:
    for (const setting of settingsStore.ccDeviceSettings.values()) {
        if (!setting.disable) {
            continue // whole device is not disabled, then was handled above
        }
        const deviceItem = {
            id: setting.uid,
            label: setting.name,
            name: null, // devices do not have names
            deviceUID: setting.uid,
            children: [],
            isChecked: false,
        }
        allDevices.push(deviceItem)
    }
    // Enabled Devices:
    for (const device of deviceStore.allDevices()) {
        if (device.type === DeviceType.CUSTOM_SENSORS) {
            continue // not a hardware device
        }
        const deviceSettings = settingsStore.allUIDeviceSettings.get(device.uid)!
        const deviceItem = {
            id: device.uid,
            label: deviceSettings.name,
            name: null, // devices do not have names
            deviceUID: device.uid,
            children: [],
            isChecked: true,
        }
        // Devices will be considered "checked" by their sensors
        for (const temp of device.status.temps) {
            const nodeId: string = `${device.uid}_${temp.name}`
            // @ts-ignore
            deviceItem.children.push({
                id: nodeId,
                label: deviceSettings.sensorsAndChannels.get(temp.name)!.name,
                name: temp.name,
                deviceUID: device.uid,
                isChecked: true,
            })
            defaultCheckedNodeIds.push(nodeId)
        }
        for (const channel of device.status.channels) {
            if (channel.name.toLowerCase().includes('freq')) {
                const nodeId = `${device.uid}_${channel.name}`
                // @ts-ignore
                deviceItem.children.push({
                    id: nodeId,
                    label: deviceSettings.sensorsAndChannels.get(channel.name)!.name,
                    name: channel.name,
                    deviceUID: device.uid,
                    isChecked: true,
                })
                defaultCheckedNodeIds.push(nodeId)
            }
        }
        for (const channel of device.status.channels) {
            if (channel.name.toLowerCase().includes('power')) {
                const nodeId = `${device.uid}_${channel.name}`
                // @ts-ignore
                deviceItem.children.push({
                    id: nodeId,
                    label: deviceSettings.sensorsAndChannels.get(channel.name)!.name,
                    name: channel.name,
                    deviceUID: device.uid,
                    isChecked: true,
                })
                defaultCheckedNodeIds.push(nodeId)
            }
        }
        for (const channel of device.status.channels) {
            if (channel.name.toLowerCase().includes('load')) {
                const nodeId = `${device.uid}_${channel.name}`
                // @ts-ignore
                deviceItem.children.push({
                    id: nodeId,
                    label: deviceSettings.sensorsAndChannels.get(channel.name)!.name,
                    name: channel.name,
                    deviceUID: device.uid,
                    isChecked: true,
                })
                defaultCheckedNodeIds.push(nodeId)
            }
        }
        if (device.info != null) {
            for (const [channelName, channelInfo] of device.info.channels.entries()) {
                if (channelInfo.speed_options === null) {
                    continue
                }
                const nodeId = `${device.uid}_${channelName}`
                // @ts-ignore
                deviceItem.children.push({
                    id: nodeId,
                    label: deviceSettings.sensorsAndChannels.get(channelName)!.name,
                    name: channelName,
                    deviceUID: device.uid,
                    isChecked: true,
                })
                defaultCheckedNodeIds.push(nodeId)
            }
            for (const [channelName, channelInfo] of device.info.channels.entries()) {
                if (channelInfo.lighting_modes.length === 0) {
                    continue
                }
                const nodeId = `${device.uid}_${channelName}`
                // @ts-ignore
                deviceItem.children.push({
                    id: nodeId,
                    label: deviceSettings.sensorsAndChannels.get(channelName)!.name,
                    name: channelName,
                    deviceUID: device.uid,
                    isChecked: true,
                })
                defaultCheckedNodeIds.push(nodeId)
            }
            for (const [channelName, channelInfo] of device.info.channels.entries()) {
                if (channelInfo.lcd_modes.length === 0) {
                    continue
                }
                const nodeId = `${device.uid}_${channelName}`
                // @ts-ignore
                deviceItem.children.push({
                    id: nodeId,
                    label: deviceSettings.sensorsAndChannels.get(channelName)!.name,
                    name: channelName,
                    deviceUID: device.uid,
                    isChecked: true,
                })
                defaultCheckedNodeIds.push(nodeId)
            }
        }
        // Disabled Channels/Sensors:
        if (settingsStore.ccDeviceSettings.has(device.uid)) {
            for (const channelName of settingsStore.ccDeviceSettings.get(device.uid)!
                .disable_channels) {
                const nodeId = `${device.uid}_${channelName}`
                // @ts-ignore
                deviceItem.children.push({
                    id: nodeId,
                    label: deviceSettings.sensorsAndChannels.get(channelName)?.name ?? channelName,
                    name: channelName,
                    deviceUID: device.uid,
                    isChecked: false,
                })
            }
        }
        allDevices.push(deviceItem)
    }
    return allDevices
}

createTreeMenu()

const saveCCDeviceSettings = async (): Promise<void> => {
    confirm.require({
        message: t('layout.settings.devices.toggleRequiresRestart'),
        header: t('layout.settings.devices.enableDevices'),
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            const ccDeviceSettingsToSet: Array<CoolerControlDeviceSettingsDTO> = []
            for (const deviceNode of treeRef.value!.data) {
                // @ts-ignore
                const deviceUID = deviceNode.deviceUID
                // @ts-ignore
                const deviceIsEnabled = deviceNode.isChecked
                // @ts-ignore
                const deviceChannels = deviceNode.children
                if (!settingsStore.ccDeviceSettings.has(deviceUID)) {
                    console.error(`CCDeviceSetting not found for this device: ${deviceUID}`)
                    return
                }
                const ccSetting: CoolerControlDeviceSettingsDTO =
                    settingsStore.ccDeviceSettings.get(deviceUID)!
                ccSetting.disable = !deviceIsEnabled
                if (deviceIsEnabled) {
                    // No deviceChannels means previously blacklisted, now enabled, leave channels alone
                    if (deviceChannels.length >= 0) {
                        const disabledChannelNames: Array<string> = []
                        for (const channelNode of deviceChannels) {
                            // @ts-ignore
                            if (channelNode.isChecked) continue
                            disabledChannelNames.push(channelNode.name)
                        }
                        ccSetting.disable_channels = disabledChannelNames
                    }
                }
                ccDeviceSettingsToSet.push(ccSetting)
            }
            let oneSuccessful: boolean = true
            for (const ccSetting of ccDeviceSettingsToSet) {
                oneSuccessful =
                    (await deviceStore.daemonClient.saveCCDeviceSettings(
                        ccSetting.uid,
                        ccSetting,
                    )) || oneSuccessful
            }
            if (oneSuccessful) {
                await deviceStore.daemonClient.shutdownDaemon()
                await deviceStore.waitAndReload()
            } else {
                toast.add({
                    severity: 'error',
                    summary: t('common.error'),
                    detail: t('layout.settings.devices.unknownError'),
                    life: 4000,
                })
            }
        },
    })
}
</script>

<template>
    <div class="flex flex-col lg:flex-row">
        <table class="bg-bg-two rounded-lg w-[36rem]">
            <tbody>
                <tr class="border-border-one border-b-2">
                    <td class="p-4 text-wrap italic">
                        <svg-icon
                            type="mdi"
                            class="mr-2 inline"
                            :path="mdiHelpCircleOutline"
                            :size="deviceStore.getREMSize(1.3)"
                        />
                        {{ t('layout.settings.devices.detectionIssues') }}
                        <a
                            target="_blank"
                            href="https://docs.coolercontrol.org/hardware-support.html"
                            class="text-accent"
                        >
                            {{ t('layout.settings.devices.hardwareSupportDoc') }}
                        </a>
                    </td>
                </tr>
                <tr v-tooltip.right="t('layout.settings.devices.selectTooltip')">
                    <td class="flex justify-between py-4">
                        <div
                            class="flex flex-row w-full my-1 mx-4 leading-none text-center items-center"
                        >
                            <svg-icon
                                type="mdi"
                                class="w-8"
                                :path="mdiRestart"
                                :size="deviceStore.getREMSize(1.0)"
                                v-tooltip.top="t('layout.settings.tooltips.triggersRestart')"
                            />
                            <span class="w-full">{{
                                t('layout.settings.devices.devicesAndSensors')
                            }}</span>
                            <Button
                                :label="t('common.apply')"
                                class="bg-accent/80 hover:!bg-accent w-80 h-[2.375rem]"
                                @click="saveCCDeviceSettings"
                                v-tooltip.top="t('layout.settings.tooltips.saveAndReload')"
                            />
                        </div>
                    </td>
                </tr>
                <tr>
                    <td class="px-4">
                        <el-tree
                            ref="treeRef"
                            class="device-menu mb-2 py-2 pl-2 bg-bg-two rounded-lg border-border-one border"
                            :data="data"
                            :props="nodeProps"
                            node-key="id"
                            default-expand-all
                            show-checkbox
                            check-on-click-node
                            :highlight-current="false"
                            :expand-on-click-node="false"
                            :indent="deviceStore.getREMSize(0.5)"
                            :render-after-expand="false"
                            :default-checked-keys="defaultCheckedNodeIds"
                            :icon="TreeIcon"
                            @check-change="
                                (node, checked, childrenChecked) =>
                                    (node.isChecked = checked || childrenChecked)
                            "
                        >
                            <template #default="{ node, data }">
                                <div
                                    class="tree-text"
                                    :class="{ 'disabled-text': !data.isChecked }"
                                >
                                    {{ node.label }}
                                </div>
                            </template>
                        </el-tree>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped lang="scss">
.disabled-text {
    opacity: 0.3;
}

.el-tree {
    --el-fill-color-blank: rgb(var(--colors-bg-one));
    --el-font-size-base: 1rem;
    --el-tree-text-color: rgb(var(--colors-text-color));
    --el-tree-node-content-height: 2.5rem;
    --el-tree-node-hover-bg-color: rgb(var(--colors-bg-two));
    --el-text-color-placeholder: rgb(var(--colors-text-color));
    --el-color-primary-light-9: rgb(var(--colors-bg-two));
}

.el-tree-node:focus > .el-tree-node__content {
    background-color: rgb(var(--colors-bg-two)) !important;
}

.tree-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
<style lang="scss">
.el-checkbox {
    margin-left: 6px !important;
    --el-checkbox-input-border: var(--el-border-width) var(--el-border-style)
        rgba(var(--colors-accent) / 0.3);
}
</style>
