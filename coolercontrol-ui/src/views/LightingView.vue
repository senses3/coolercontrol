<!--
  SPDX-FileCopyrightText: 2022 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon'
import { type UID } from '@/models/Device'
import { useDeviceStore } from '@/stores/DeviceStore'
import { useSettingsStore } from '@/stores/SettingsStore'
import { DeviceSettingReadDTO, DeviceSettingWriteLightingDTO } from '@/models/DaemonSettings'
import { LightingMode, LightingModeType } from '@/models/LightingMode'
import { computed, inject, nextTick, onMounted, ref, type Ref, watch } from 'vue'
import CCColorPicker from '@/components/CCColorPicker.vue'
import { mdiAlertOutline, mdiContentSaveOutline } from '@mdi/js'
import { ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from 'reka-ui'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { useConfirm } from '@/shell/confirm'
import UiButton from '@/shell/ui/UiButton.vue'
import UiListbox from '@/shell/ui/UiListbox.vue'
import UiNumberInput from '@/shell/ui/UiNumberInput.vue'
import UiSelect from '@/shell/ui/UiSelect.vue'
import UiSlider from '@/shell/ui/UiSlider.vue'
import { useI18n } from 'vue-i18n'
import EntityTitleRename from '@/components/EntityTitleRename.vue'
import EntityPageHeader from '@/components/EntityPageHeader.vue'
import UiSwitch from '@/shell/ui/UiSwitch.vue'
import { Emitter, EventType } from 'mitt'

interface Props {
    deviceUID: UID
    channelName: string
}

const props = defineProps<Props>()
const { t } = useI18n()
const emitter: Emitter<Record<EventType, any>> = inject('emitter')!

const absoluteMaxColors = 48 // Current device max is 40
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const confirm = useConfirm()

const channelLabel = ref(
    settingsStore.allUIDeviceSettings
        .get(props.deviceUID)
        ?.sensorsAndChannels.get(props.channelName)?.name ?? props.channelName,
)
const contextIsDirty: Ref<boolean> = ref(false)
const lightingModes: Array<LightingMode> = []
const noneLightingMode = new LightingMode('none', 'None', 0, 0, false, false, LightingModeType.NONE)
lightingModes.push(noneLightingMode)
const lightingSpeeds: Array<string> = []
for (const device of deviceStore.allDevices()) {
    if (device.uid != props.deviceUID) {
        continue
    }
    for (const mode of device.info?.channels.get(props.channelName)?.lighting_modes ?? []) {
        lightingModes.push(mode)
    }
    for (const speed of device.info?.lighting_speeds ?? []) {
        lightingSpeeds.push(speed)
    }
}

const daemonSetting = computed<DeviceSettingReadDTO | undefined>(() =>
    settingsStore.allDaemonDeviceSettings.get(props.deviceUID)?.settings.get(props.channelName),
)
const defaultColor = 'rgb(255, 255, 255)' // default LED color
const rgbString = (rgbTuple: [number, number, number]): string =>
    `rgb(${rgbTuple[0]}, ${rgbTuple[1]}, ${rgbTuple[2]})`
const defaultSpeed: string =
    lightingSpeeds.length === 0
        ? 'none'
        : lightingSpeeds.length === 1
          ? lightingSpeeds[0]
          : lightingSpeeds.length === 5
            ? lightingSpeeds[2]
            : lightingSpeeds[Math.floor(lightingSpeeds.length / 2)]

// One ref per possible color for the page's lifetime. The pickers bind to these,
// and only the first `selectedNumberOfColors` are ever shown or saved.
const colorsUI: Array<Ref<string>> = Array.from({ length: absoluteMaxColors }, () =>
    ref(defaultColor),
)
const selectedMode: Ref<LightingMode> = ref(noneLightingMode)
const selectedSpeed: Ref<string> = ref(defaultSpeed)
const selectedBackwardEnabled: Ref<boolean> = ref(false)
const selectedNumberOfColors: Ref<number> = ref(0)

const seedFromDaemonSetting = (): void => {
    const lighting = daemonSetting.value?.lighting
    const mode =
        lighting != null
            ? (lightingModes.find((candidate) => candidate.name === lighting.mode) ??
              noneLightingMode)
            : noneLightingMode
    selectedMode.value = mode
    selectedSpeed.value = mode.speed_enabled
        ? (lightingSpeeds.find((speed) => speed === lighting?.speed) ?? defaultSpeed)
        : defaultSpeed
    selectedBackwardEnabled.value = mode.backward_enabled ? (lighting?.backward ?? false) : false
    selectedNumberOfColors.value = mode.max_colors > 0 ? (lighting?.colors.length ?? 0) : 0
    for (const [index, color] of colorsUI.entries()) {
        const rgbTuple = lighting?.colors[index]
        color.value = rgbTuple != null ? rgbString(rgbTuple) : defaultColor
    }
}
seedFromDaemonSetting()

// Activating a Mode rewrites this channel's lighting in the daemon, as does any
// other client. The state above is seeded once, so follow the daemon whenever its
// setting really changes. Compared as a signature string: every settings reload
// hands back new DTO objects, so object identity would fire on unrelated saves.
watch(
    () => JSON.stringify(daemonSetting.value?.lighting ?? null),
    () => {
        seedFromDaemonSetting()
        // The dirty watcher runs on the same flush, off these very writes. The page
        // now matches the daemon, so clear the flag once that watcher has had its turn.
        nextTick(() => (contextIsDirty.value = false))
    },
)

const colorsToShow = computed(() => colorsUI.slice(0, selectedNumberOfColors.value))

const getDefaultColor = (colorIndex: number): string => {
    const rgbTuple = daemonSetting.value?.lighting?.colors[colorIndex]
    return rgbTuple != null ? rgbString(rgbTuple) : defaultColor
}

const parseRgbString = (rgbColor: string): [number, number, number] => {
    const matchArray = rgbColor.match(/\d{1,3}/g)
    if (matchArray?.length != 3) {
        console.error(`Invalid rgb value: ${rgbColor}`)
        return [255, 255, 255]
    }
    const rbg: Array<number> = matchArray.map((value: string) => Number(value))
    return [rbg[0], rbg[1], rbg[2]]
}

const saveLighting = async (): Promise<void> => {
    if (selectedMode.value.type === LightingModeType.NONE) {
        await settingsStore.saveDaemonDeviceSettingReset(props.deviceUID, props.channelName)
        contextIsDirty.value = false
        return
    }
    const setting = new DeviceSettingWriteLightingDTO(selectedMode.value.name)
    if (selectedMode.value.speed_enabled) {
        setting.speed = selectedSpeed.value
    }
    if (selectedMode.value.backward_enabled) {
        setting.backward = selectedBackwardEnabled.value
    }
    if (selectedMode.value.max_colors > 0) {
        for (let i = 0; i < selectedNumberOfColors.value; i++) {
            setting.colors.push(parseRgbString(colorsUI[i].value))
        }
    }
    await settingsStore.saveDaemonDeviceSettingLighting(props.deviceUID, props.channelName, setting)
    contextIsDirty.value = false
}
const defaultLabel = computed(() =>
    settingsStore.defaultChannelLabel(props.deviceUID, props.channelName),
)
const saveNameFunction = async (newName: string): Promise<boolean> => {
    // User names are persisted as daemon name overrides. An empty name removes
    // the override and falls back to the detected label, which has to be read
    // before saving drops the override it is derived from.
    const applied = newName.length > 0 ? newName : defaultLabel.value
    const success = await settingsStore.saveChannelName(props.deviceUID, props.channelName, newName)
    if (!success) {
        return false
    }
    channelLabel.value = applied
    emitter.emit('device-sensor-name-update', {
        deviceUID: props.deviceUID,
        sensorId: props.channelName,
        name: applied,
    })
    return true
}

const modeOptions = computed(() =>
    lightingModes.map((mode: LightingMode) => ({ label: mode.frontend_name, value: mode.name })),
)
const selectedModeName = computed<string | undefined>({
    get: () => selectedMode.value?.name,
    set: (name) => {
        const mode = lightingModes.find((candidate: LightingMode) => candidate.name === name)
        if (mode != null) selectedMode.value = mode
    },
})
const speedOptions = computed(() =>
    lightingSpeeds.map((speed: string) => ({
        label: deviceStore.toTitleCase(speed),
        value: speed,
    })),
)
const changeLightingSpeed = (value: string | string[] | undefined): void => {
    if (value == null || Array.isArray(value)) {
        return // do not update on unselect
    }
    selectedSpeed.value = value
}

const numberColorsScrolled = (event: WheelEvent): void => {
    if (event.deltaY < 0) {
        if (selectedNumberOfColors.value < selectedMode.value.max_colors)
            selectedNumberOfColors.value += 1
    } else {
        if (selectedNumberOfColors.value > selectedMode.value.min_colors)
            selectedNumberOfColors.value -= 1
    }
}
const addScrollEventListeners = () => {
    // @ts-ignore
    document?.querySelector('.number-colors-input')?.addEventListener('wheel', numberColorsScrolled)
}

watch(selectedMode, () => {
    if (selectedMode.value.max_colors > 0) {
        if (selectedMode.value.max_colors === selectedMode.value.min_colors) {
            selectedNumberOfColors.value = selectedMode.value.max_colors
        } else {
            selectedNumberOfColors.value = Math.max(
                Math.min(selectedNumberOfColors.value, selectedMode.value.max_colors),
                selectedMode.value.min_colors,
            )
        }
    } else {
        selectedNumberOfColors.value = 0
    }
})

const checkForUnsavedChanges = (): boolean | Promise<boolean> => {
    if (!contextIsDirty.value) {
        return true
    }
    return new Promise<boolean>((resolve) => {
        confirm.require({
            message: 'There are unsaved changes made to these Lighting Settings.',
            header: 'Unsaved Changes',
            icon: mdiAlertOutline,
            defaultFocus: 'accept',
            rejectLabel: 'Stay',
            acceptLabel: 'Discard',
            accept: () => {
                contextIsDirty.value = false
                resolve(true)
            },
            reject: () => resolve(false),
        })
    })
}

onMounted(() => {
    onBeforeRouteUpdate(checkForUnsavedChanges)
    onBeforeRouteLeave(checkForUnsavedChanges)
    addScrollEventListeners()
    watch(selectedMode, () => {
        nextTick(addScrollEventListeners)
    })
    watch([selectedMode, selectedSpeed, selectedBackwardEnabled, selectedNumberOfColors], () => {
        contextIsDirty.value = true
    })
})
</script>

<template>
    <div class="flex h-full flex-col">
        <entity-page-header>
            <template #title>
                <entity-title-rename
                    :current-name="channelLabel"
                    :fallback-name="defaultLabel"
                    :save-name-function="saveNameFunction"
                />
            </template>
            <template #actions>
                <div class="p-2 flex flex-row">
                    <UiButton
                        class="w-32"
                        :class="{ 'animate-pulse-fast': contextIsDirty }"
                        v-tooltip.top="t('views.lighting.saveLightingSettings')"
                        @click="saveLighting"
                    >
                        <svg-icon
                            class="outline-0"
                            type="mdi"
                            :path="mdiContentSaveOutline"
                            :size="deviceStore.getREMSize(1.5)"
                        />
                    </UiButton>
                </div>
            </template>
        </entity-page-header>
        <ScrollAreaRoot class="min-h-0 flex-1" style="--scrollbar-size: 10px">
            <ScrollAreaViewport class="p-4 h-full w-full">
                <div class="w-full flex flex-col lg:flex-row">
                    <div id="left-side">
                        <div class="mt-0 mr-4 w-96">
                            <small class="ml-3 font-light text-sm text-text-color-secondary">
                                {{ t('views.lighting.lightingMode') }}<br />
                            </small>
                            <span
                                v-tooltip.top="t('views.lighting.lightingMode')"
                                class="mt-1 block w-full"
                            >
                                <UiSelect
                                    v-model="selectedModeName"
                                    :options="modeOptions"
                                    class="w-full"
                                />
                            </span>
                        </div>
                        <div v-if="selectedMode.speed_enabled" class="mt-4 mr-4 w-96">
                            <small class="ml-3 font-light text-sm text-text-color-secondary">
                                {{ t('views.lighting.speed') }}
                            </small>
                            <UiListbox
                                :model-value="selectedSpeed"
                                :options="speedOptions"
                                class="w-full"
                                v-tooltip.top="t('views.lighting.speed')"
                                @update:model-value="changeLightingSpeed"
                            />
                        </div>
                        <div v-if="selectedMode.backward_enabled" class="mt-4 mr-4 w-96">
                            <small class="ml-3 font-light text-sm text-text-color-secondary">
                                {{ t('views.lighting.direction') }}<br />
                            </small>
                            <div
                                class="bg-bg-two border border-border-one p-1 rounded-lg text-center items-center"
                            >
                                <span class="inline-flex items-center justify-center gap-2 p-2">
                                    <span>{{ t('views.lighting.forward') }}</span>
                                    <UiSwitch v-model="selectedBackwardEnabled" two-sided />
                                    <span>{{ t('views.lighting.backward') }}</span>
                                </span>
                            </div>
                        </div>
                        <div
                            v-if="selectedMode.max_colors > 0"
                            class="mt-4 mr-4 w-96 border-border-one"
                        >
                            <small class="ml-3 font-light text-sm text-text-color-secondary">
                                {{ t('views.lighting.numberOfColors') }}<br />
                            </small>
                            <div class="rounded-lg border border-border-one bg-bg-two p-3">
                                <UiNumberInput
                                    v-model="selectedNumberOfColors"
                                    class="mt-0.5"
                                    :min="selectedMode.min_colors"
                                    :max="selectedMode.max_colors"
                                    :step="1"
                                    v-tooltip.top="t('views.lighting.numberOfColorsTooltip')"
                                    :disabled="selectedMode.min_colors == selectedMode.max_colors"
                                />
                                <UiSlider
                                    v-model="selectedNumberOfColors"
                                    class="mt-3 !w-full px-1"
                                    :step="1"
                                    :min="selectedMode.min_colors"
                                    :max="selectedMode.max_colors"
                                    :disabled="selectedMode.min_colors == selectedMode.max_colors"
                                />
                            </div>
                        </div>
                    </div>
                    <div
                        id="right-side"
                        v-if="selectedMode.max_colors > 0"
                        class="flex h-full mt-4 ml-1"
                    >
                        <div class="content-center flex justify-center">
                            <div class="color-wrapper mt-1">
                                <c-c-color-picker
                                    v-for="(color, index) in colorsToShow"
                                    class="m-2"
                                    :key="index"
                                    v-model="color.value"
                                    color-format="rgb"
                                    :default-color="getDefaultColor(index)"
                                    :size="10"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </ScrollAreaViewport>
            <ScrollAreaScrollbar
                class="flex select-none touch-none p-0.5 bg-transparent transition-colors duration-[120ms] ease-out data-[orientation=vertical]:w-2.5"
                orientation="vertical"
            >
                <ScrollAreaThumb
                    class="flex-1 bg-border-one opacity-80 rounded-lg relative before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:w-full before:h-full before:min-w-[44px] before:min-h-[44px]"
                />
            </ScrollAreaScrollbar>
        </ScrollAreaRoot>
    </div>
</template>

<style scoped lang="scss">
.color-wrapper {
    display: flex;
    flex-wrap: wrap;
    line-height: normal;
    min-width: 10rem;
}
</style>
