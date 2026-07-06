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
    mdiCheckboxBlankOutline,
    mdiCheckboxMarked,
    mdiInformationSlabCircleOutline,
    mdiLightbulbOutline,
    mdiPlus,
    mdiTelevision,
} from '@mdi/js'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { type Color, DeviceType, getDeviceTypeDisplayName, type UID } from '@/models/Device.ts'
import { getDriverTypeDisplayName } from '@/models/DeviceInfo.ts'
import CCColorPicker from '@/components/CCColorPicker.vue'
import EntityTitleRename from '@/components/EntityTitleRename.vue'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useThemeColorsStore } from '@/stores/ThemeColorsStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { useDeviceActions } from '@/composables/useDeviceActions.ts'
import { customSensorNames, deviceChannelLinks, sensorToggles } from '@/shell/devices/devices.ts'
import UiButton from '@/shell/ui/UiButton.vue'
import UiSeparator from '@/shell/ui/UiSeparator.vue'
import UiSwitch from '@/shell/ui/UiSwitch.vue'
import UiTooltip from '@/shell/ui/UiTooltip.vue'

const props = defineProps<{ deviceUID: UID }>()
const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const colorStore = useThemeColorsStore()
const deviceActions = useDeviceActions()

const device = computed(() =>
    [...deviceStore.allDevices()].find((dev) => dev.uid === props.deviceUID),
)
const ccSetting = computed(() => settingsStore.ccDeviceSettings.get(props.deviceUID))
const isDisabledDevice = computed(() => device.value == null && ccSetting.value?.disable === true)

const uiSettings = computed(() => settingsStore.allUIDeviceSettings.get(props.deviceUID))
const deviceLabel = computed(
    () => uiSettings.value?.name ?? ccSetting.value?.name ?? props.deviceUID,
)
// The color picker needs a concrete color; var() strings are not parseable.
const deviceColor = computed(
    () => uiSettings.value?.userColor || `rgb(${colorStore.themeColors.text_color})`,
)

const saveNameFunction = async (newName: string): Promise<boolean> =>
    settingsStore.saveDeviceName(props.deviceUID, newName)

const setDeviceColor = (newColor: Color): void => {
    if (uiSettings.value != null) uiSettings.value.userColor = newColor
}

// Info rows, mirroring the old device-info popover.
const infoRows = computed((): Array<[string, string]> => {
    const dev = device.value
    if (dev == null) return []
    const rows: Array<[string, string]> = [
        [t('components.deviceInfo.systemName'), dev.name],
        [t('components.deviceInfo.deviceType'), getDeviceTypeDisplayName(dev.type)],
        [t('components.deviceInfo.deviceUID'), dev.uid],
    ]
    if (dev.lc_info?.firmware_version) {
        rows.push([t('components.deviceInfo.firmwareVersion'), dev.lc_info.firmware_version])
    }
    if (dev.info?.model) rows.push([t('components.deviceInfo.model'), dev.info.model])
    if (dev.info?.driver_info.name) {
        rows.push([t('components.deviceInfo.driverName'), dev.info.driver_info.name])
    }
    if (dev.info != null) {
        rows.push([
            t('components.deviceInfo.driverType'),
            getDriverTypeDisplayName(dev.info.driver_info.drv_type),
        ])
    }
    if (dev.info?.driver_info.version) {
        rows.push([t('components.deviceInfo.driverVersion'), dev.info.driver_info.version])
    }
    if (dev.info != null && dev.info.driver_info.locations.length > 0) {
        rows.push([t('components.deviceInfo.locations'), dev.info.driver_info.locations.join('\n')])
    }
    return rows
})

// Hardware settings, ported from the extension-settings popover.
const isLiquidctl = computed(() => device.value?.type === DeviceType.LIQUIDCTL)
const isCustomSensors = computed(() => device.value?.type === DeviceType.CUSTOM_SENSORS)
const sensorNames = computed(() => (device.value != null ? customSensorNames(device.value) : []))
const sensorDotColor = (channelName: string): string =>
    settingsStore.allUIDeviceSettings.get(props.deviceUID)?.sensorsAndChannels.get(channelName)
        ?.color || 'rgb(var(--colors-text-color))'
const hasHwmonDriver = computed(
    () => device.value?.info?.driver_info.locations.find((loc) => loc.includes('hwmon')) != null,
)
const isAmdGpuWithOverdrive = computed(() => device.value?.info?.amd_gpu_overdrive != null)
const amdOverdriveEnabled = computed(() => device.value?.info?.amd_gpu_overdrive === true)
const amdOverdriveEnabling = ref(false)
const isThinkPad = computed(() => device.value?.info?.thinkpad_fan_control != null)

const deviceExtensions = computed(() => ccSetting.value?.extensions)
const directAccess = ref(deviceExtensions.value?.direct_access ?? false)
const useHwmon = ref(false)
const delayMillis = ref(deviceExtensions.value?.delay_millis ?? 0)

const onDirectAccessChange = (value: boolean): void => {
    if (deviceExtensions.value == null || value === deviceExtensions.value.direct_access) return
    deviceActions.setDirectAccess(props.deviceUID, value, () => {
        directAccess.value = deviceExtensions.value!.direct_access
    })
}

const onUseHwmonChange = (value: boolean): void => {
    if (!value) return
    deviceActions.switchToHwmon(props.deviceUID, () => {
        useHwmon.value = false
    })
}

const onDelayChange = (): void => {
    const value = Math.min(250, Math.max(0, Math.round(delayMillis.value ?? 0)))
    delayMillis.value = value
    if (deviceExtensions.value == null || value === deviceExtensions.value.delay_millis) return
    deviceActions.setDelayMillis(props.deviceUID, value, () => {
        delayMillis.value = deviceExtensions.value!.delay_millis
    })
}

const onEnableOverdrive = async (): Promise<void> => {
    amdOverdriveEnabling.value = true
    await deviceActions.enableAmdOverdrive()
    amdOverdriveEnabling.value = false
}

const thinkPadFanControl = computed({
    get: () => settingsStore.thinkPadFanControlEnabled,
    set: (value: boolean) => deviceActions.applyThinkPadFanControl(value),
})
const thinkPadFullSpeed = computed({
    // persisted automatically through the global CC settings watcher
    get: () => settingsStore.ccSettings.thinkpad_full_speed,
    set: (value: boolean) => (settingsStore.ccSettings.thinkpad_full_speed = value),
})

// Sensor enable/disable checklist (per-device slice of the old settings tree).
const disabledChannelNames = computed((): string[] => {
    const names: string[] = []
    for (const [channelName, channelSettings] of ccSetting.value?.channel_settings ?? []) {
        if (channelSettings.disabled) names.push(channelName)
    }
    return names
})
const toggles = computed(() =>
    device.value != null ? sensorToggles(device.value, disabledChannelNames.value) : [],
)
const sensorState = ref<Map<string, boolean>>(new Map())
const resetSensorState = (): void => {
    sensorState.value = new Map(toggles.value.map((tog) => [tog.channelName, tog.enabled]))
}
resetSensorState()

const sensorLabel = (channelName: string): string =>
    uiSettings.value?.sensorsAndChannels.get(channelName)?.name ??
    ccSetting.value?.channel_settings.get(channelName)?.label ??
    channelName

const toggleSensor = (channelName: string): void => {
    sensorState.value.set(channelName, !(sensorState.value.get(channelName) ?? true))
}
const sensorsDirty = computed(() =>
    toggles.value.some((tog) => sensorState.value.get(tog.channelName) !== tog.enabled),
)
const applySensors = (): void => {
    deviceActions.applySensorChanges(props.deviceUID, true, sensorState.value, (success) => {
        if (!success) resetSensorState()
    })
}

const disableDevice = (): void => {
    deviceActions.applySensorChanges(props.deviceUID, false, new Map(), () => {})
}
const enableDevice = (): void => {
    deviceActions.applySensorChanges(props.deviceUID, true, new Map(), () => {})
}

const channelLinks = computed(() => (device.value != null ? deviceChannelLinks(device.value) : []))
</script>

<template>
    <div class="flex h-full flex-col overflow-y-auto p-4">
        <!-- Disabled device: minimal page with re-enable. -->
        <template v-if="isDisabledDevice">
            <h1 class="text-xl font-semibold text-text-color">{{ deviceLabel }}</h1>
            <p class="mt-2 text-base text-text-color-secondary">
                {{ t('layout.shell.devicesPage.deviceDisabled') }}
            </p>
            <UiButton class="mt-4 w-fit" variant="outline" @click="enableDevice">
                {{ t('layout.shell.devicesPage.enableDevice') }}
            </UiButton>
        </template>

        <template v-else-if="device != null">
            <div class="flex items-center gap-2">
                <EntityTitleRename
                    :current-name="deviceLabel"
                    :save-name-function="saveNameFunction"
                />
                <CCColorPicker
                    :model-value="deviceColor"
                    :size="1.5"
                    @update:model-value="setDeviceColor"
                />
            </div>

            <!-- Device details -->
            <h2 class="pb-2 pt-4 text-xs uppercase text-text-color-secondary">
                {{ t('components.deviceInfo.details') }}
            </h2>
            <div class="w-fit rounded-lg border border-border-one bg-bg-two px-4 py-3">
                <div class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-base">
                    <template v-for="[label, value] in infoRows" :key="label">
                        <span class="text-text-color-secondary">{{ label }}</span>
                        <span class="whitespace-pre-line break-all text-text-color">
                            {{ value }}
                        </span>
                    </template>
                </div>
            </div>

            <!-- Custom sensors are created and edited from this device page. -->
            <template v-if="isCustomSensors">
                <h2 class="pb-2 pt-6 text-xs uppercase text-text-color-secondary">
                    {{ t('layout.menu.customSensors') }}
                </h2>
                <div
                    class="flex w-fit min-w-96 flex-col rounded-lg border border-border-one bg-bg-two p-2"
                >
                    <RouterLink
                        v-for="sensorName in sensorNames"
                        :key="sensorName"
                        :to="{
                            name: 'device-custom-sensor',
                            params: { customSensorID: sensorName },
                        }"
                        class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none hover:bg-surface-hover focus:ring-2 focus:ring-accent"
                    >
                        <span
                            class="h-2 w-2 shrink-0 rounded-full"
                            :style="{ backgroundColor: sensorDotColor(sensorName) }"
                        />
                        <span class="truncate">{{ sensorLabel(sensorName) }}</span>
                    </RouterLink>
                    <RouterLink
                        :to="{ name: 'device-custom-sensor-new' }"
                        class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-text-color-secondary outline-none hover:bg-surface-hover hover:text-text-color focus:ring-2 focus:ring-accent"
                    >
                        <svg-icon type="mdi" :path="mdiPlus" :size="14" class="shrink-0" />
                        {{ t('layout.menu.tooltips.addCustomSensor') }}
                    </RouterLink>
                </div>
            </template>
            <!-- Hardware settings -->
            <template v-if="!isCustomSensors">
                <h2 class="pb-2 pt-6 text-xs uppercase text-text-color-secondary">
                    {{ t('components.deviceExtensionSettings.title') }}
                </h2>
                <div
                    class="flex w-fit min-w-96 flex-col rounded-lg border border-border-one bg-bg-two"
                >
                    <div
                        v-if="isLiquidctl"
                        class="flex items-center justify-between gap-8 px-4 py-3"
                    >
                        <span class="flex items-center gap-2 text-base text-text-color">
                            <UiTooltip
                                :text="t('components.deviceExtensionSettings.directAccessDesc')"
                            >
                                <svg-icon
                                    type="mdi"
                                    :path="mdiInformationSlabCircleOutline"
                                    :size="18"
                                    class="text-text-color-secondary"
                                />
                            </UiTooltip>
                            {{ t('components.deviceExtensionSettings.directAccess') }}
                        </span>
                        <UiSwitch
                            v-model="directAccess"
                            :disabled="!hasHwmonDriver"
                            @update:model-value="onDirectAccessChange"
                        />
                    </div>
                    <template v-if="isLiquidctl">
                        <UiSeparator />
                        <div class="flex items-center justify-between gap-8 px-4 py-3">
                            <span class="flex items-center gap-2 text-base text-text-color">
                                <UiTooltip
                                    :text="t('components.deviceExtensionSettings.useHwmonDesc')"
                                >
                                    <svg-icon
                                        type="mdi"
                                        :path="mdiInformationSlabCircleOutline"
                                        :size="18"
                                        class="text-text-color-secondary"
                                    />
                                </UiTooltip>
                                {{ t('components.deviceExtensionSettings.useHwmon') }}
                            </span>
                            <UiSwitch
                                v-model="useHwmon"
                                :disabled="!hasHwmonDriver"
                                @update:model-value="onUseHwmonChange"
                            />
                        </div>
                    </template>
                    <template v-if="isAmdGpuWithOverdrive">
                        <UiSeparator v-if="isLiquidctl" />
                        <div class="flex items-center justify-between gap-8 px-4 py-3">
                            <span class="flex items-center gap-2 text-base text-text-color">
                                <UiTooltip
                                    :text="t('components.deviceExtensionSettings.overdriveDesc')"
                                >
                                    <svg-icon
                                        type="mdi"
                                        :path="mdiInformationSlabCircleOutline"
                                        :size="18"
                                        class="text-text-color-secondary"
                                    />
                                </UiTooltip>
                                {{ t('components.deviceExtensionSettings.overdrive') }}
                            </span>
                            <span v-if="amdOverdriveEnabled" class="text-base text-success">
                                {{ t('components.deviceExtensionSettings.overdriveActive') }}
                            </span>
                            <UiButton
                                v-else
                                size="sm"
                                variant="outline"
                                :disabled="amdOverdriveEnabling"
                                @click="onEnableOverdrive"
                            >
                                {{ t('components.deviceExtensionSettings.overdriveEnable') }}
                            </UiButton>
                        </div>
                    </template>
                    <template v-if="isThinkPad">
                        <UiSeparator v-if="isLiquidctl || isAmdGpuWithOverdrive" />
                        <div class="flex items-center justify-between gap-8 px-4 py-3">
                            <span class="flex items-center gap-2 text-base text-text-color">
                                <UiTooltip
                                    :text="
                                        t(
                                            'components.deviceExtensionSettings.thinkPadFanControlDesc',
                                        )
                                    "
                                >
                                    <svg-icon
                                        type="mdi"
                                        :path="mdiInformationSlabCircleOutline"
                                        :size="18"
                                        class="text-text-color-secondary"
                                    />
                                </UiTooltip>
                                {{ t('components.deviceExtensionSettings.thinkPadFanControl') }}
                            </span>
                            <UiSwitch v-model="thinkPadFanControl" />
                        </div>
                        <UiSeparator />
                        <div class="flex items-center justify-between gap-8 px-4 py-3">
                            <span class="flex items-center gap-2 text-base text-text-color">
                                <UiTooltip
                                    :text="
                                        t(
                                            'components.deviceExtensionSettings.thinkPadFullSpeedDesc',
                                        )
                                    "
                                >
                                    <svg-icon
                                        type="mdi"
                                        :path="mdiInformationSlabCircleOutline"
                                        :size="18"
                                        class="text-text-color-secondary"
                                    />
                                </UiTooltip>
                                {{ t('components.deviceExtensionSettings.thinkPadFullSpeed') }}
                            </span>
                            <UiSwitch v-model="thinkPadFullSpeed" />
                        </div>
                    </template>
                    <UiSeparator v-if="isLiquidctl || isAmdGpuWithOverdrive || isThinkPad" />
                    <div class="flex items-center justify-between gap-8 px-4 py-3">
                        <span class="flex items-center gap-2 text-base text-text-color">
                            <UiTooltip
                                :text="t('components.deviceExtensionSettings.commandDelayDesc')"
                            >
                                <svg-icon
                                    type="mdi"
                                    :path="mdiInformationSlabCircleOutline"
                                    :size="18"
                                    class="text-text-color-secondary"
                                />
                            </UiTooltip>
                            {{ t('components.deviceExtensionSettings.commandDelay') }}
                        </span>
                        <span class="flex items-center gap-1.5">
                            <input
                                v-model.number="delayMillis"
                                type="number"
                                min="0"
                                max="250"
                                step="10"
                                class="h-9 w-20 rounded-lg border border-border-one bg-bg-one px-2 text-right text-base text-text-color outline-none focus:ring-2 focus:ring-accent"
                                @change="onDelayChange"
                            />
                            <span class="text-sm text-text-color-secondary">ms</span>
                        </span>
                    </div>
                    <UiSeparator />
                    <div class="flex items-center justify-between gap-8 px-4 py-3">
                        <span class="text-base text-text-color">
                            {{ t('layout.shell.devicesPage.disableDevice') }}
                        </span>
                        <UiButton size="sm" variant="outline" @click="disableDevice">
                            {{ t('layout.shell.devicesPage.disable') }}
                        </UiButton>
                    </div>
                </div>
            </template>
            <!-- Sensors enable/disable -->
            <div class="flex items-center gap-3 pb-2 pt-6">
                <h2 class="text-xs uppercase text-text-color-secondary">
                    {{ t('layout.shell.devicesPage.sensors') }}
                </h2>
                <UiButton v-if="sensorsDirty" size="sm" @click="applySensors">
                    {{ t('common.apply') }}
                </UiButton>
            </div>
            <div
                class="flex w-fit min-w-96 flex-col rounded-lg border border-border-one bg-bg-two p-2"
            >
                <button
                    v-for="tog in toggles"
                    :key="tog.channelName"
                    type="button"
                    class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-base text-text-color outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
                    @click="toggleSensor(tog.channelName)"
                >
                    <svg-icon
                        type="mdi"
                        :path="
                            (sensorState.get(tog.channelName) ?? true)
                                ? mdiCheckboxMarked
                                : mdiCheckboxBlankOutline
                        "
                        :size="18"
                        :class="
                            (sensorState.get(tog.channelName) ?? true)
                                ? 'text-accent'
                                : 'text-text-color-secondary'
                        "
                    />
                    <span class="truncate">{{ sensorLabel(tog.channelName) }}</span>
                </button>
            </div>

            <!-- Lighting and LCD channels -->
            <template v-if="channelLinks.length > 0">
                <h2 class="pb-2 pt-6 text-xs uppercase text-text-color-secondary">
                    {{ t('layout.shell.devicesPage.lightingLcd') }}
                </h2>
                <div
                    class="flex w-fit min-w-96 flex-col rounded-lg border border-border-one bg-bg-two p-2"
                >
                    <RouterLink
                        v-for="link in channelLinks"
                        :key="`${link.kind}-${link.channelName}`"
                        :to="{
                            name: link.kind === 'lighting' ? 'device-lighting' : 'device-lcd',
                            params: { deviceUID: link.deviceUID, channelName: link.channelName },
                        }"
                        class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-base text-text-color outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
                    >
                        <svg-icon
                            type="mdi"
                            :path="link.kind === 'lighting' ? mdiLightbulbOutline : mdiTelevision"
                            :size="16"
                            class="text-text-color-secondary"
                        />
                        <span class="truncate">
                            {{ sensorLabel(link.channelName) }}
                        </span>
                    </RouterLink>
                </div>
            </template>
            <div class="pb-8" />
        </template>
    </div>
</template>
