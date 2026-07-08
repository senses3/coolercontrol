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
    mdiContentSaveOutline,
    mdiFileImageOutline,
    mdiImageMultipleOutline,
    mdiFolderSearchOutline,
} from '@mdi/js'
import { useSettingsStore } from '@/stores/SettingsStore'
import { useDeviceStore } from '@/stores/DeviceStore'
import type { UID } from '@/models/Device'
import {
    computed,
    ComputedRef,
    inject,
    nextTick,
    onMounted,
    onUnmounted,
    type Ref,
    ref,
    toRaw,
    watch,
} from 'vue'
import { LcdMode, LcdModeType } from '@/models/LcdMode'
import {
    DeviceSettingReadDTO,
    DeviceSettingWriteLcdDTO,
    LcdCarouselSettings,
    TempSource,
} from '@/models/DaemonSettings'
import { useToast } from '@/shell/toast'
import { ErrorResponse } from '@/models/ErrorResponse'
import { ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from 'reka-ui'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import UiButton from '@/shell/ui/UiButton.vue'
import UiGroupedListbox from '@/shell/ui/UiGroupedListbox.vue'
import UiInput from '@/shell/ui/UiInput.vue'
import UiListbox from '@/shell/ui/UiListbox.vue'
import UiNumberInput from '@/shell/ui/UiNumberInput.vue'
import UiSlider from '@/shell/ui/UiSlider.vue'
import { showLoadingOverlay } from '@/components/loadingOverlay.ts'
import { useI18n } from 'vue-i18n'
import EntityTitleRename from '@/components/EntityTitleRename.vue'
import { Emitter, EventType } from 'mitt'
import HealthWarning from '@/components/HealthWarning.vue'

interface Props {
    deviceUID: UID
    channelName: string
}

const props = defineProps<Props>()
const { t } = useI18n()
const emitter: Emitter<Record<EventType, any>> = inject('emitter')!

interface AvailableTemp {
    deviceUID: string // needed here as well for the dropdown selector
    tempName: string
    tempFrontendName: string
    lineColor: string
    temp: string
}

interface AvailableTempSources {
    deviceUID: string
    deviceName: string
    temps: Array<AvailableTemp>
}

const deviceStore = useDeviceStore()
// We need to use the raw state to watch for changes, as the pinia reactive proxy isn't properly
// reacting to changes from Vue's shallowRef & triggerRef anymore.
const rawStore = toRaw(deviceStore.$state)
const settingsStore = useSettingsStore()
const toast = useToast()
const confirm = useConfirm()

const channelLabel = ref(
    settingsStore.allUIDeviceSettings
        .get(props.deviceUID)
        ?.sensorsAndChannels.get(props.channelName)?.name ?? props.channelName,
)
const contextIsDirty: Ref<boolean> = ref(false)
let imageWidth: number = 320
let imageSizeMaxBytes: number = 10_000_000
for (const device of deviceStore.allDevices()) {
    if (device.uid === props.deviceUID && device.info != null) {
        const channelInfo = device.info.channels.get(props.channelName)
        if (channelInfo != null && channelInfo.lcd_info != null) {
            imageWidth = channelInfo.lcd_info.screen_width
            imageSizeMaxBytes = channelInfo.lcd_info.max_image_size_bytes * 2 // we double it so that processing can reduce it further
        }
    }
}
const lcdModes: Array<LcdMode> = []
const noneLcdMode = new LcdMode('none', 'None', false, false, false, 0, 0, LcdModeType.NONE)
lcdModes.push(noneLcdMode)
for (const device of deviceStore.allDevices()) {
    if (device.uid != props.deviceUID) {
        continue
    }
    for (const mode of device.info?.channels.get(props.channelName)?.lcd_modes ?? []) {
        lcdModes.push(mode)
    }
}

const tempSources: Ref<Array<AvailableTempSources>> = ref([])
const fillTempSources = () => {
    tempSources.value.length = 0
    for (const device of deviceStore.allDevices()) {
        if (device.status.temps.length === 0 || device.info == null) {
            continue
        }
        const deviceSettings = settingsStore.allUIDeviceSettings.get(device.uid)!
        const deviceSource: AvailableTempSources = {
            deviceUID: device.uid,
            deviceName: deviceSettings.name,
            temps: [],
        }
        for (const temp of device.status.temps) {
            deviceSource.temps.push({
                deviceUID: device.uid,
                tempName: temp.name,
                tempFrontendName: deviceSettings.sensorsAndChannels.get(temp.name)!.name,
                lineColor: deviceSettings.sensorsAndChannels.get(temp.name)!.color,
                temp: temp.temp.toFixed(1),
            })
        }
        if (deviceSource.temps.length === 0) {
            continue // when all of a devices temps are hidden
        }
        tempSources.value.push(deviceSource)
    }
}
fillTempSources()
let startingLcdMode: LcdMode = noneLcdMode
let startingBrightness: number = 50
let startingOrientation: number = 0
let startingTempSource: AvailableTemp | undefined = undefined
let startingImagePath: string | undefined = undefined
let startingImagesPath: string = ''
let startingInterval: number = 10
const startingDeviceSetting: DeviceSettingReadDTO | undefined =
    settingsStore.allDaemonDeviceSettings.get(props.deviceUID)?.settings.get(props.channelName)
if (startingDeviceSetting?.lcd != null) {
    startingLcdMode =
        lcdModes.find((lcdMode: LcdMode) => lcdMode.name === startingDeviceSetting.lcd?.mode) ??
        noneLcdMode
    startingBrightness = startingDeviceSetting.lcd.brightness ?? startingBrightness
    startingOrientation = startingDeviceSetting.lcd.orientation ?? startingOrientation
    startingImagePath = startingDeviceSetting.lcd.image_file_processed
    startingImagesPath = startingDeviceSetting.lcd.carousel?.images_path ?? ''
    startingInterval = startingDeviceSetting.lcd.carousel?.interval ?? 10
    const savedTempSource: TempSource | undefined = startingDeviceSetting.lcd.temp_source
    if (savedTempSource != null) {
        outer: for (const tempDevice of tempSources.value) {
            for (const tempSource of tempDevice.temps) {
                if (
                    tempSource.deviceUID === savedTempSource.device_uid &&
                    tempSource.tempName === savedTempSource.temp_name
                ) {
                    startingTempSource = tempSource
                    break outer
                }
            }
        }
    }
}

const selectedLcdMode: Ref<LcdMode> = ref(startingLcdMode)
const selectedBrightness: Ref<number> = ref(startingBrightness)
const selectedOrientation: Ref<number> = ref(startingOrientation)
const chosenTemp: Ref<AvailableTemp | undefined> = ref(startingTempSource)
const files: Array<File> = []
const fileDataURLs: Ref<Array<string>> = ref([])
const imagesPath: Ref<string> = ref(startingImagesPath)
const imagesDelayInterval: Ref<number> = ref(startingInterval)

/**
 * We intercept the automatic uploader to handle our custom logic here
 * @param event
 */
const filesChosen = async (event: { files: File[] }): Promise<void> => {
    if (!Array.isArray(event.files) || event.files.length === 0) {
        console.error('No File attached to the uploader')
        return
    }
    files.length = 0
    fileDataURLs.value.length = 0
    for (const chosenFile of event.files) {
        validateFileSize(chosenFile)
        validateFileType(chosenFile)
    }
    const processing = showLoadingOverlay({
        target: '#lcd-control-pane',
        text: t('views.lcd.processing'),
        background: 'rgba(var(--colors-bg-one) / 0.8)',
    })
    const response: File | ErrorResponse = await deviceStore.daemonClient.processLcdImageFiles(
        props.deviceUID,
        props.channelName,
        event.files,
    )
    processing.close()
    if (response instanceof ErrorResponse) {
        console.error(response.error)
        toast.add({
            severity: 'error',
            summary: t('common.error'),
            detail: response.error,
            life: 10_000,
        })
        return
    }
    fileDataURLs.value.push(URL.createObjectURL(response))
    files.push(response)
}

const validateFileSize = (file: File): void => {
    if (file.size <= imageSizeMaxBytes) {
        return
    }
    console.error('Image is too large for the LCD Screen memory')
    toast.add({
        severity: 'error',
        summary: t('common.error'),
        detail: t('views.lcd.imageTooLarge'),
        life: 4000,
    })
}

const validateFileType = (file: File): void => {
    if (file.type.startsWith('image/')) {
        return
    }
    console.error('File is not an image')
    toast.add({
        severity: 'error',
        summary: t('common.error'),
        detail: t('views.lcd.notImageType'),
        life: 4000,
    })
}

const saveLCDSetting = async () => {
    if (selectedLcdMode.value.type === LcdModeType.NONE) {
        await settingsStore.saveDaemonDeviceSettingReset(props.deviceUID, props.channelName)
        contextIsDirty.value = false
        return
    }
    const setting = new DeviceSettingWriteLcdDTO(selectedLcdMode.value.name)
    if (selectedLcdMode.value.brightness) {
        setting.brightness = selectedBrightness.value
    }
    if (selectedLcdMode.value.orientation) {
        setting.orientation = selectedOrientation.value
    }
    if (setting.mode === 'temp' && chosenTemp.value != null) {
        setting.temp_source = new TempSource(chosenTemp.value.deviceUID, chosenTemp.value.tempName)
    }
    if (setting.mode === 'carousel' && imagesPath.value.length > 0) {
        setting.carousel = new LcdCarouselSettings(imagesDelayInterval.value, imagesPath.value)
    }

    const uploading = showLoadingOverlay({
        target: '#lcd-control-pane',
        text: t('views.lcd.applying'),
        background: 'rgba(var(--colors-bg-one) / 0.8)',
    })
    if (setting.mode === 'image' && files.length > 0) {
        await settingsStore.saveDaemonDeviceSettingLcdImages(
            props.deviceUID,
            props.channelName,
            setting,
            files,
        )
    } else {
        await settingsStore.saveDaemonDeviceSettingLcd(props.deviceUID, props.channelName, setting)
    }
    uploading.close()
    contextIsDirty.value = false
}
const saveNameFunction = async (newName: string): Promise<boolean> => {
    // User names are persisted as daemon name overrides. An empty name
    // removes the override and reloads the UI.
    const success = await settingsStore.saveChannelName(props.deviceUID, props.channelName, newName)
    if (!success) {
        return false
    }
    if (newName.length > 0) {
        channelLabel.value = newName
        emitter.emit('device-sensor-name-update', {
            deviceUID: props.deviceUID,
            sensorId: props.channelName,
            name: newName,
        })
    }
    return true
}

const updateTemps = () => {
    for (const tempDevice of tempSources.value) {
        for (const availableTemp of tempDevice.temps) {
            availableTemp.temp =
                deviceStore.currentDeviceStatus
                    .get(availableTemp.deviceUID)!
                    .get(availableTemp.tempName)!.temp || '0.0'
        }
    }
}

const lcdModeOptions = computed(() =>
    lcdModes.map((mode: LcdMode) => ({ label: mode.frontend_name, value: mode.name })),
)
const selectedLcdModeName = computed(() => selectedLcdMode.value?.name)
const changeLcdMode = (value: string | undefined): void => {
    if (value == null) {
        return // do not update on unselect
    }
    const mode = lcdModes.find((candidate: LcdMode) => candidate.name === value)
    if (mode != null) selectedLcdMode.value = mode
}

const tempKey = (temp: AvailableTemp): string => `${temp.deviceUID}/${temp.tempName}`
const tempGroups = computed(() =>
    tempSources.value.map((source) => ({
        label: source.deviceName,
        options: source.temps.map((temp) => ({
            label: temp.tempFrontendName,
            value: tempKey(temp),
            color: temp.lineColor,
            rightText: `${temp.temp} ${t('common.tempUnit')}`,
        })),
    })),
)
const chosenTempKey = computed(() =>
    chosenTemp.value != null ? tempKey(chosenTemp.value) : undefined,
)
const changeTempSource = (value: string | string[] | undefined): void => {
    if (value == null || Array.isArray(value)) {
        return // do not update on unselect
    }
    const temp = tempSources.value
        .flatMap((source) => source.temps)
        .find((candidate) => tempKey(candidate) === value)
    if (temp != null) chosenTemp.value = temp
}

const fileInputRef = ref<HTMLInputElement>()
const filesSelected = (event: Event): void => {
    const input = event.target as HTMLInputElement
    if (input.files != null && input.files.length > 0) {
        void filesChosen({ files: [...input.files] })
        input.value = ''
    }
}
const filesDropped = (event: DragEvent): void => {
    const dropped = [...(event.dataTransfer?.files ?? [])]
    if (dropped.length > 0) void filesChosen({ files: dropped })
}

const delayIntervalFormatted: ComputedRef<string> = computed((): string => {
    const minutes: number = Math.floor(imagesDelayInterval.value / 60)
    const seconds: number = imagesDelayInterval.value % 60
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
})

const pathBrowse = async (): Promise<void> => {
    // @ts-ignore
    const ipc = window.ipc
    imagesPath.value = await ipc.directoryPathDialog('Select Images Directory')
}

const brightnessScrolled = (event: WheelEvent): void => {
    // if (selectedBrightness.value == null) return
    if (event.deltaY < 0) {
        if (selectedBrightness.value < 100) selectedBrightness.value += 1
    } else {
        if (selectedBrightness.value > 0) selectedBrightness.value -= 1
    }
}
const orientationScrolled = (event: WheelEvent): void => {
    if (event.deltaY < 0) {
        if (selectedOrientation.value < 270) selectedOrientation.value += 90
    } else {
        if (selectedOrientation.value > 0) selectedOrientation.value -= 90
    }
}
const addScrollEventListeners = () => {
    // @ts-ignore
    document.querySelector('.brightness-input')?.addEventListener('wheel', brightnessScrolled)
    // @ts-ignore
    document.querySelector('.orientation-input')?.addEventListener('wheel', orientationScrolled)
}

watch(fileDataURLs.value, () => {
    if (fileDataURLs.value.length === 0) {
        return
    } else if (fileDataURLs.value.length > 1) {
        // future feature that requires a Timer
        return
    }
    const img: HTMLImageElement =
        (document.getElementById('lcd-image') as HTMLImageElement) ?? new HTMLImageElement()
    img.src = fileDataURLs.value[0]
})

const checkForUnsavedChanges = (): boolean | Promise<boolean> => {
    if (!contextIsDirty.value) {
        return true
    }
    return new Promise<boolean>((resolve) => {
        confirm.require({
            message: t('views.lcd.unsavedChanges'),
            header: t('views.lcd.unsavedChangesHeader'),
            icon: 'pi pi-exclamation-triangle',
            defaultFocus: 'accept',
            rejectLabel: t('common.stay'),
            acceptLabel: t('common.discard'),
            accept: () => {
                contextIsDirty.value = false
                resolve(true)
            },
            reject: () => resolve(false),
        })
    })
}

onMounted(async () => {
    onBeforeRouteUpdate(checkForUnsavedChanges)
    onBeforeRouteLeave(checkForUnsavedChanges)
    if (startingLcdMode.name === 'image' && startingImagePath != null) {
        const response: File | ErrorResponse =
            await deviceStore.daemonClient.getDeviceSettingLcdImage(
                props.deviceUID,
                props.channelName,
            )
        if (response instanceof ErrorResponse) {
            console.error(response.error)
        } else {
            fileDataURLs.value.push(URL.createObjectURL(response))
            files.push(response)
        }
    }
    watch(rawStore.currentDeviceStatus, () => {
        updateTemps()
    })
    watch(settingsStore.allUIDeviceSettings, () => {
        fillTempSources()
    })
    watch(
        [
            fileDataURLs.value,
            selectedLcdMode,
            selectedBrightness,
            selectedOrientation,
            chosenTemp,
            imagesPath,
            imagesDelayInterval,
        ],
        () => {
            contextIsDirty.value = true
        },
    )

    addScrollEventListeners()
    watch(selectedLcdMode, (): void => {
        nextTick(addScrollEventListeners)
    })
})

onUnmounted(() => {
    for (const dataURL of fileDataURLs.value) {
        // make sure these can be garbage collected:
        URL.revokeObjectURL(dataURL)
    }
})
</script>

<template>
    <div class="flex items-center justify-between px-2 pt-2">
        <entity-title-rename :current-name="channelLabel" :save-name-function="saveNameFunction" />
        <div class="flex flex-wrap gap-x-1 justify-end">
            <div class="p-2 flex flex-row">
                <UiButton
                    class="w-32"
                    :class="{ 'animate-pulse-fast': contextIsDirty }"
                    v-tooltip.top="t('views.lcd.saveLcdSettings')"
                    @click="saveLCDSetting"
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
    </div>
    <ScrollAreaRoot id="lcd-control-pane" style="--scrollbar-size: 10px">
        <ScrollAreaViewport class="p-4 pb-16 h-screen w-full">
            <health-warning
                kind="lcd"
                :device-uid="props.deviceUID"
                :channel-name="props.channelName"
                class="mb-4"
            />
            <div class="w-full flex flex-col lg:flex-row">
                <div id="left-side">
                    <div class="mt-0 mr-4 w-96">
                        <small class="ml-3 font-light text-sm text-text-color-secondary">
                            {{ t('views.lcd.lcdMode') }}
                        </small>
                        <UiListbox
                            :model-value="selectedLcdModeName"
                            :options="lcdModeOptions"
                            class="w-full"
                            v-tooltip.top="t('views.lcd.lcdMode')"
                            @update:model-value="changeLcdMode"
                        />
                    </div>
                    <div v-if="selectedLcdMode.brightness" class="mt-4 mr-4 w-96 border-border-one">
                        <small class="ml-3 font-light text-sm text-text-color-secondary">
                            {{ t('views.lcd.brightness') }}<br />
                        </small>
                        <div class="rounded-lg border border-border-one bg-bg-two p-3">
                            <UiNumberInput
                                v-model="selectedBrightness"
                                :min="0"
                                :max="100"
                                :step="1"
                                v-tooltip.top="t('views.lcd.brightnessPercent')"
                                :suffix="t('common.percentUnit')"
                            />
                            <UiSlider
                                v-model="selectedBrightness"
                                class="mt-3 !w-full px-1"
                                :step="1"
                                :min="0"
                                :max="100"
                            />
                        </div>
                    </div>
                    <div
                        v-if="selectedLcdMode.orientation"
                        class="mt-4 mr-4 w-96 border-border-one"
                    >
                        <small class="ml-3 font-light text-sm text-text-color-secondary">
                            {{ t('views.lcd.orientation') }}<br />
                        </small>
                        <div class="rounded-lg border border-border-one bg-bg-two p-3">
                            <UiNumberInput
                                v-model="selectedOrientation"
                                :min="0"
                                :max="270"
                                :step="90"
                                v-tooltip.top="t('views.lcd.orientationDegrees')"
                                suffix="°"
                            />
                            <UiSlider
                                v-model="selectedOrientation"
                                class="mt-3 !w-full px-1"
                                :step="90"
                                :min="0"
                                :max="270"
                            />
                        </div>
                    </div>
                    <div v-if="selectedLcdMode.image" class="mt-8 mr-4 w-96 border-border-one">
                        <div
                            class="flex flex-col gap-2 rounded-lg border border-dashed border-border-one p-3"
                            @dragover.prevent
                            @drop.prevent="filesDropped"
                        >
                            <input
                                ref="fileInputRef"
                                type="file"
                                accept="image/jpeg,image/png,image/gif,image/tiff,image/bmp"
                                class="hidden"
                                @change="filesSelected"
                            />
                            <UiButton class="w-full" @click="fileInputRef?.click()">
                                <svg-icon
                                    type="mdi"
                                    :path="mdiImageMultipleOutline"
                                    :size="18"
                                    class="mr-1"
                                />
                                {{ t('views.lcd.chooseImage') }}
                            </UiButton>
                            <p class="text-center text-sm text-text-color-secondary">
                                {{ t('views.lcd.dragAndDrop') }}
                            </p>
                        </div>
                    </div>
                </div>
                <div
                    id="right-side"
                    v-if="selectedLcdMode.image"
                    class="flex flex-col lg:flex-row mt-4 ml-1 w-96 h-96 min-w-96 min-h-96"
                >
                    <div class="flex w-full mr-0">
                        <img
                            v-if="fileDataURLs.length > 0"
                            :src="fileDataURLs[0]"
                            id="lcd-image"
                            alt="LCD Image"
                        />
                        <svg-icon
                            v-else
                            id="lcd-image"
                            class="text-text-color-secondary h-96"
                            style="padding: 40px"
                            type="mdi"
                            :path="mdiFileImageOutline"
                            :size="imageWidth + 60"
                        />
                    </div>
                </div>
                <div
                    v-if="
                        selectedLcdMode.type === LcdModeType.CUSTOM &&
                        selectedLcdMode.name === 'temp'
                    "
                    class="mt-0 mr-4 w-96"
                >
                    <small class="ml-3 font-light text-sm text-text-color-secondary">
                        {{ t('views.lcd.tempSource') }}
                    </small>
                    <UiGroupedListbox
                        :model-value="chosenTempKey"
                        class="w-full mt-0 max-h-[28rem]"
                        :groups="tempGroups"
                        filter
                        :filter-placeholder="t('common.search')"
                        :invalid="chosenTemp == null"
                        v-tooltip.top="t('views.lcd.tempSourceTooltip')"
                        @update:model-value="changeTempSource"
                    />
                </div>
                <div
                    v-if="
                        selectedLcdMode.type === LcdModeType.CUSTOM &&
                        selectedLcdMode.name === 'carousel'
                    "
                    class="mt-0 mr-4 w-96"
                >
                    <div class="flex flex-col">
                        <small class="ml-3 mb-1 font-light text-sm text-text-color-secondary">
                            {{ t('views.lcd.imagesPath') }}
                        </small>
                        <UiInput
                            v-model="imagesPath"
                            class="w-full mt-0"
                            placeholder="/tmp/your_images_path"
                            :class="{ '!border-error': !imagesPath }"
                            v-tooltip.top="t('views.lcd.imagesPathTooltip')"
                        />
                        <div v-if="deviceStore.isQtApp()">
                            <UiButton
                                class="mt-2 w-full"
                                v-tooltip.top="t('views.lcd.browseTooltip')"
                                @click="pathBrowse"
                            >
                                <svg-icon
                                    class="outline-0 mt-[-0.25rem]"
                                    type="mdi"
                                    :path="mdiFolderSearchOutline"
                                    :size="deviceStore.getREMSize(1.5)"
                                />
                                {{ t('views.lcd.browse') }}
                            </UiButton>
                        </div>
                    </div>
                    <div class="mt-4">
                        <small class="ml-3 font-light text-sm text-text-color-secondary">
                            {{ t('views.lcd.delayInterval') }}:
                            <span class="font-extrabold">{{ delayIntervalFormatted }}</span
                            ><br />
                        </small>
                        <UiNumberInput
                            v-model="imagesDelayInterval"
                            :min="5"
                            :max="900"
                            :step="1"
                            v-tooltip.top="t('views.lcd.delayIntervalTooltip')"
                            :suffix="t('common.secondAbbr')"
                        />
                        <UiSlider
                            v-model="imagesDelayInterval"
                            class="!w-[23.25rem] ml-1.5"
                            :step="1"
                            :min="2"
                            :max="900"
                        />
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
</template>

<style scoped lang="scss">
#lcd-image {
    border-radius: 50%;
    border-color: rgb(var(--colors-bg-two));
    border-width: 1.5rem;
    border-style: solid;
    background: rgb(var(--colors-bg-one));
}
</style>
