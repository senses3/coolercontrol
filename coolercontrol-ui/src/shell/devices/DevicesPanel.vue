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
import { mdiAlert, mdiLightbulbOutline, mdiTelevision } from '@mdi/js'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { type Color, getDeviceTypeDisplayName, type UID } from '@/models/Device.ts'
import CCColorPicker from '@/components/CCColorPicker.vue'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useThemeColorsStore } from '@/stores/ThemeColorsStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { DEVICE_TYPE_ORDER, deviceChannelLinks, hardwareDevices } from '@/shell/devices/devices.ts'

const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const colorStore = useThemeColorsStore()

const devices = computed(() => hardwareDevices(deviceStore.allDevices()))

const typeGroups = computed(() =>
    DEVICE_TYPE_ORDER.map((type) => ({
        type,
        devices: devices.value.filter((device) => device.type === type),
    })).filter((group) => group.devices.length > 0),
)

const disabledDevices = computed(() =>
    [...settingsStore.ccDeviceSettings.values()].filter((setting) => setting.disable),
)

const deviceLabel = (deviceUID: UID): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.name ?? deviceUID

const deviceColor = (deviceUID: UID): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.userColor ?? ''

// The picker needs a valid color; devices without one fall back to the theme
// text color, matching the old device color picker.
const pickerColor = (deviceUID: UID): string =>
    deviceColor(deviceUID) || `rgb(${colorStore.themeColors.text_color})`

const channelLabel = (deviceUID: UID, channelName: string): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.sensorsAndChannels.get(channelName)?.name ??
    channelName

const isUnhealthy = (deviceUID: UID): boolean =>
    settingsStore.healthFailsafe.some((ref) => ref.device_uid === deviceUID)

const setDeviceColor = (deviceUID: UID, newColor: Color): void => {
    const setting = settingsStore.allUIDeviceSettings.get(deviceUID)
    if (setting != null) setting.userColor = newColor
}
</script>

<template>
    <div class="flex flex-col gap-0.5 p-2 pb-24 text-base">
        <template v-for="group in typeGroups" :key="group.type">
            <div class="px-2 pb-1 pt-2 text-xs uppercase text-text-color-secondary">
                {{ getDeviceTypeDisplayName(group.type) }}
            </div>
            <template v-for="device in group.devices" :key="device.uid">
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
                            :style="
                                deviceColor(device.uid)
                                    ? { backgroundColor: deviceColor(device.uid) }
                                    : {}
                            "
                        />
                        <span class="truncate">{{ deviceLabel(device.uid) }}</span>
                        <svg-icon
                            v-if="isUnhealthy(device.uid)"
                            type="mdi"
                            :path="mdiAlert"
                            :size="14"
                            class="shrink-0 text-warning"
                        />
                    </RouterLink>
                    <div
                        class="ml-auto hidden items-center gap-0.5 pr-1 group-hover:flex group-focus-within:flex"
                    >
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
            </template>
        </template>

        <template v-if="disabledDevices.length > 0">
            <div class="px-2 pb-1 pt-3 text-xs uppercase text-text-color-secondary">
                {{ t('layout.shell.devicesPanel.disabled') }}
            </div>
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
