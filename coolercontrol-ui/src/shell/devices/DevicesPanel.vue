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
    mdiAlert,
    mdiDragVertical,
    mdiLightbulbOutline,
    mdiPinOff,
    mdiPinOutline,
    mdiPlus,
    mdiTelevision,
} from '@mdi/js'
import { VueDraggable } from 'vue-draggable-plus'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import {
    type Color,
    type Device,
    DeviceType,
    getDeviceTypeDisplayName,
    type UID,
} from '@/models/Device.ts'
import CCColorPicker from '@/components/CCColorPicker.vue'
import PanelHeader from '@/shell/PanelHeader.vue'
import TagPopover from '@/shell/monitoring/TagPopover.vue'
import UiTooltip from '@/shell/ui/UiTooltip.vue'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useThemeColorsStore } from '@/stores/ThemeColorsStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { customSensorNames, deviceChannelLinks, hardwareDevices } from '@/shell/devices/devices.ts'
import { pinId } from '@/shell/cooling/channels.ts'
import { setDeviceChildrenSubset, setTopLevelOrder } from '@/shell/panelOrder.ts'

const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const colorStore = useThemeColorsStore()

// One flat drag-sortable list; the device type shows as a row suffix.
const devicesList = ref<Device[]>([])
watchEffect(() => {
    devicesList.value = hardwareDevices(deviceStore.allDevices())
})

const persistDeviceOrder = (): void => {
    const orderedUids = devicesList.value.map((device) => device.uid)
    settingsStore.menuOrder = setTopLevelOrder(settingsStore.menuOrder, orderedUids)
    deviceStore.reSortDevicesByMenuOrder()
}

// Custom sensor children are drag-sortable too.
const sensorNamesByDevice = ref<Map<UID, string[]>>(new Map())
watchEffect(() => {
    const map = new Map<UID, string[]>()
    for (const device of devicesList.value) {
        if (device.type === DeviceType.CUSTOM_SENSORS) {
            map.set(device.uid, customSensorNames(device))
        }
    }
    sensorNamesByDevice.value = map
})

const persistSensorOrder = (deviceUID: UID): void => {
    const names = sensorNamesByDevice.value.get(deviceUID) ?? []
    const ids = names.map((name) => pinId(deviceUID, name))
    settingsStore.menuOrder = setDeviceChildrenSubset(settingsStore.menuOrder, deviceUID, ids, ids)
    deviceStore.reSortDevicesByMenuOrder()
}

const disabledDevices = computed(() =>
    [...settingsStore.ccDeviceSettings.values()].filter((setting) => setting.disable),
)

const deviceLabel = (deviceUID: UID): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.name ?? deviceUID

const deviceColor = (deviceUID: UID): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.userColor ?? ''

// Devices without a custom color fall back to the theme text color. The dot
// can use the CSS variable directly; the picker needs a concrete color value
// (its conversion helpers cannot parse var() strings).
const dotColor = (deviceUID: UID): string =>
    deviceColor(deviceUID) || 'rgb(var(--colors-text-color))'
const pickerColor = (deviceUID: UID): string =>
    deviceColor(deviceUID) || `rgb(${colorStore.themeColors.text_color})`

const sensorDotColor = (deviceUID: UID, channelName: string): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.sensorsAndChannels.get(channelName)?.color ||
    'rgb(var(--colors-text-color))'
const sensorPickerColor = (deviceUID: UID, channelName: string): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.sensorsAndChannels.get(channelName)?.color ||
    `rgb(${colorStore.themeColors.text_color})`

const channelLabel = (deviceUID: UID, channelName: string): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.sensorsAndChannels.get(channelName)?.name ??
    channelName

// The virtual CustomSensors device shows health on the affected sensor rows
// instead of the device row.
const isDeviceUnhealthy = (device: Device): boolean =>
    device.type !== DeviceType.CUSTOM_SENSORS &&
    settingsStore.healthFailsafe.some((ref) => ref.device_uid === device.uid)

const isChannelUnhealthy = (deviceUID: UID, channelName: string): boolean =>
    settingsStore.healthFailsafe.some(
        (ref) => ref.device_uid === deviceUID && ref.name === channelName,
    )

const failsafeTooltip = (deviceUID: UID, channelName?: string): string => {
    const ref = settingsStore.healthFailsafe.find(
        (entry) =>
            entry.device_uid === deviceUID && (channelName == null || entry.name === channelName),
    )
    const base = t('views.appInfo.failsafeActive')
    return ref?.reason ? `${base}: ${ref.reason}` : base
}

const setDeviceColor = (deviceUID: UID, newColor: Color): void => {
    const setting = settingsStore.allUIDeviceSettings.get(deviceUID)
    if (setting != null) setting.userColor = newColor
}

const setSensorColor = (deviceUID: UID, channelName: string, newColor: Color): void => {
    const setting = settingsStore.allUIDeviceSettings
        .get(deviceUID)
        ?.sensorsAndChannels.get(channelName)
    if (setting != null) setting.userColor = newColor
}

const isPinned = (deviceUID: UID, channelName: string): boolean =>
    settingsStore.pinnedIds.includes(pinId(deviceUID, channelName))

const togglePin = (deviceUID: UID, channelName: string): void => {
    const id = pinId(deviceUID, channelName)
    settingsStore.pinnedIds = settingsStore.pinnedIds.includes(id)
        ? settingsStore.pinnedIds.filter((pinned) => pinned !== id)
        : [...settingsStore.pinnedIds, id]
}

// Keeps a row's hover actions visible while its tag popover is open.
const openTagRow = ref<string | null>(null)
const onTagOpen = (rowKey: string, open: boolean): void => {
    openTagRow.value = open ? rowKey : null
}
</script>

<template>
    <div class="flex flex-col gap-0.5 p-2 pb-24 text-base">
        <VueDraggable
            v-model="devicesList"
            handle=".drag-handle"
            :animation="150"
            class="flex flex-col gap-0.5"
            @end="persistDeviceOrder"
        >
            <div v-for="device in devicesList" :key="device.uid" class="flex flex-col gap-0.5">
                <div
                    class="group flex items-center rounded-lg hover:bg-surface-hover focus-within:bg-surface-hover focus-within:ring-2 focus-within:ring-accent"
                >
                    <RouterLink
                        :to="{ name: 'devices-device', params: { deviceUID: device.uid } }"
                        class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none"
                        exact-active-class="!text-accent"
                    >
                        <span
                            class="h-2 w-2 shrink-0 rounded-full"
                            :style="{ backgroundColor: dotColor(device.uid) }"
                        />
                        <span class="truncate">{{ deviceLabel(device.uid) }}</span>
                        <span
                            v-if="getDeviceTypeDisplayName(device.type) !== deviceLabel(device.uid)"
                            class="shrink-0 text-xs text-text-color-secondary"
                        >
                            {{ getDeviceTypeDisplayName(device.type) }}
                        </span>
                        <UiTooltip
                            v-if="isDeviceUnhealthy(device)"
                            :text="failsafeTooltip(device.uid)"
                        >
                            <svg-icon
                                type="mdi"
                                :path="mdiAlert"
                                :size="14"
                                class="shrink-0 text-error"
                            />
                        </UiTooltip>
                    </RouterLink>
                    <div
                        class="ml-auto hidden items-center gap-0.5 pr-1 group-hover:flex group-focus-within:flex"
                    >
                        <span class="drag-handle cursor-grab p-1 text-text-color-secondary">
                            <svg-icon type="mdi" :path="mdiDragVertical" :size="16" />
                        </span>
                        <CCColorPicker
                            :model-value="pickerColor(device.uid)"
                            :size="1.25"
                            @update:model-value="(c: Color) => setDeviceColor(device.uid, c)"
                        />
                    </div>
                </div>
                <RouterLink
                    v-for="link in deviceChannelLinks(device)"
                    :key="`${link.kind}-${link.channelName}`"
                    :to="{
                        name: link.kind === 'lighting' ? 'device-lighting' : 'device-lcd',
                        params: { deviceUID: link.deviceUID, channelName: link.channelName },
                    }"
                    class="flex items-center gap-2 rounded-lg py-1 pl-6 pr-2 text-text-color outline-none hover:bg-surface-hover focus:ring-2 focus:ring-accent"
                    exact-active-class="bg-surface-hover !text-accent"
                >
                    <svg-icon
                        type="mdi"
                        :path="link.kind === 'lighting' ? mdiLightbulbOutline : mdiTelevision"
                        :size="14"
                        class="shrink-0 text-text-color-secondary"
                    />
                    <span class="truncate">{{
                        channelLabel(link.deviceUID, link.channelName)
                    }}</span>
                </RouterLink>
                <template v-if="device.type === DeviceType.CUSTOM_SENSORS">
                    <VueDraggable
                        :model-value="sensorNamesByDevice.get(device.uid) ?? []"
                        handle=".drag-handle"
                        :animation="150"
                        class="flex flex-col gap-0.5"
                        @update:model-value="
                            (names: string[]) => sensorNamesByDevice.set(device.uid, names)
                        "
                        @end="persistSensorOrder(device.uid)"
                    >
                        <div
                            v-for="sensorName in sensorNamesByDevice.get(device.uid) ?? []"
                            :key="`custom-${sensorName}`"
                            class="group flex items-center rounded-lg hover:bg-surface-hover focus-within:bg-surface-hover focus-within:ring-2 focus-within:ring-accent"
                        >
                            <RouterLink
                                :to="{
                                    name: 'device-custom-sensor',
                                    params: { customSensorID: sensorName },
                                }"
                                class="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 pl-6 pr-2 text-text-color outline-none"
                                exact-active-class="!text-accent"
                            >
                                <span
                                    class="h-2 w-2 shrink-0 rounded-full"
                                    :style="{
                                        backgroundColor: sensorDotColor(device.uid, sensorName),
                                    }"
                                />
                                <span class="truncate">
                                    {{ channelLabel(device.uid, sensorName) }}
                                </span>
                                <UiTooltip
                                    v-if="isChannelUnhealthy(device.uid, sensorName)"
                                    :text="failsafeTooltip(device.uid, sensorName)"
                                >
                                    <svg-icon
                                        type="mdi"
                                        :path="mdiAlert"
                                        :size="14"
                                        class="shrink-0 text-error"
                                    />
                                </UiTooltip>
                            </RouterLink>
                            <div
                                class="ml-auto hidden items-center gap-0.5 pr-1 group-hover:flex group-focus-within:flex"
                                :class="{
                                    '!flex': openTagRow === `${device.uid}-${sensorName}`,
                                }"
                            >
                                <span class="drag-handle cursor-grab p-1 text-text-color-secondary">
                                    <svg-icon type="mdi" :path="mdiDragVertical" :size="16" />
                                </span>
                                <CCColorPicker
                                    :model-value="sensorPickerColor(device.uid, sensorName)"
                                    :size="1.25"
                                    @update:model-value="
                                        (c: Color) => setSensorColor(device.uid, sensorName, c)
                                    "
                                />
                                <TagPopover
                                    :device-u-i-d="device.uid"
                                    :channel-name="sensorName"
                                    @open="
                                        (open: boolean) =>
                                            onTagOpen(`${device.uid}-${sensorName}`, open)
                                    "
                                />
                                <button
                                    type="button"
                                    class="rounded p-1 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                                    :title="
                                        isPinned(device.uid, sensorName)
                                            ? t('layout.shell.coolingPanel.unpin')
                                            : t('layout.shell.coolingPanel.pin')
                                    "
                                    @click.prevent="togglePin(device.uid, sensorName)"
                                >
                                    <svg-icon
                                        type="mdi"
                                        :path="
                                            isPinned(device.uid, sensorName)
                                                ? mdiPinOff
                                                : mdiPinOutline
                                        "
                                        :size="16"
                                    />
                                </button>
                            </div>
                        </div>
                    </VueDraggable>
                    <RouterLink
                        :to="{ name: 'device-custom-sensor-new' }"
                        class="flex items-center gap-2 rounded-lg py-1 pl-6 pr-2 text-text-color-secondary outline-none hover:bg-surface-hover hover:text-text-color focus:ring-2 focus:ring-accent"
                    >
                        <svg-icon type="mdi" :path="mdiPlus" :size="14" class="shrink-0" />
                        <span class="truncate">
                            {{ t('layout.menu.tooltips.addCustomSensor') }}
                        </span>
                    </RouterLink>
                </template>
            </div>
        </VueDraggable>

        <template v-if="disabledDevices.length > 0">
            <PanelHeader :label="t('layout.shell.devicesPanel.disabled')" />
            <RouterLink
                v-for="setting in disabledDevices"
                :key="`disabled-${setting.uid}`"
                :to="{ name: 'devices-device', params: { deviceUID: setting.uid } }"
                class="block truncate rounded-lg px-2 py-1.5 text-text-color-secondary outline-none hover:bg-surface-hover focus:ring-2 focus:ring-accent"
                exact-active-class="bg-surface-hover !text-accent"
            >
                {{ setting.name }}
            </RouterLink>
        </template>
    </div>
</template>
