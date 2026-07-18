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
import { mdiPalette } from '@mdi/js'
import { Color } from '@/models/Device.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { ChromePicker, CompactPicker } from 'vue-color'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import UiButton from '@/shell/ui/UiButton.vue'
import UiInput from '@/shell/ui/UiInput.vue'
import { computed, nextTick, onUnmounted, ref, Ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useThemeColorsStore } from '@/stores/ThemeColorsStore.ts'

//! This is our own custom color picker component, which is similar to the ElColorPicker component,
//! but with more custom control.
const colorModel = defineModel<Color>({ required: true })

const props = defineProps<{
    colorFormat?: string
    defaultColor?: Color
    size?: number // trigger size in rem
}>()
const emit = defineEmits<{
    (e: 'open', value: boolean): void
    // Emitted instead of a save when the chosen color equals default-color:
    // the parent clears its stored user color so the non-user-defined color
    // takes over again (and keeps tracking future palette changes).
    (e: 'reset'): void
}>()

enum ColorFormat {
    RGB = 'rgb',
    HEX = 'hex',
}
const colorFormat = computed(() => {
    switch (props.colorFormat) {
        case ColorFormat.RGB:
            return ColorFormat.RGB
        case ColorFormat.HEX:
            return ColorFormat.HEX
        default:
            return ColorFormat.RGB
    }
})

const settingsStore = useSettingsStore()
const deviceStore = useDeviceStore()
const colorStore = useThemeColorsStore()
const { t } = useI18n()

const triggerStyle = computed(() =>
    props.size ? { width: `${props.size}rem`, height: `${props.size}rem` } : undefined,
)
const iconSize = computed(() => deviceStore.getREMSize(props.size ? props.size * 0.9 : 4.25))

// We store all colors as hex internally (text input, etc)
const currentColor: Ref<Color> = ref(colorStore.rgbToHex(colorModel.value))
const popoverOpen = ref(false)
// used to help determine closing behavior, whether closed by OK or clicking away/cancel.
let newColorApplied: boolean = false

// Preview only: shows the default in the picker and stays open for review;
// nothing applies until Save.
const resetToDefault = (): void => {
    if (props.defaultColor == null) return
    currentColor.value = colorStore.rgbToHex(props.defaultColor)
}
const closeAndSave = (): void => {
    if (!colorStore.isValidHex(currentColor.value)) return
    newColorApplied = true
    if (
        props.defaultColor != null &&
        currentColor.value.toLowerCase() === colorStore.rgbToHex(props.defaultColor).toLowerCase()
    ) {
        // Saving the exact default clears the user override instead of
        // pinning the default as a new user color.
        emit('reset')
    } else {
        colorModel.value =
            colorFormat.value === ColorFormat.HEX
                ? currentColor.value
                : colorStore.hexToRgbString(currentColor.value)
        // note: the color model is updated with a reactive delay, so logging is error-prone
    }
    popoverOpen.value = false
}
// Close on Escape regardless of where focus sits: clicking the picker
// canvases drops focus to body, which reka's own escape handling misses.
const onDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    popoverOpen.value = false
}
watch(popoverOpen, (open) => {
    if (open) {
        document.addEventListener('keydown', onDocumentKeydown, { capture: true })
        emit('open', true)
    } else {
        document.removeEventListener('keydown', onDocumentKeydown, { capture: true })
        popoverClose()
    }
})
onUnmounted(() => {
    document.removeEventListener('keydown', onDocumentKeydown, { capture: true })
})

const popoverClose = (): void => {
    // hide from the above buttons also triggers this:
    if (!newColorApplied) {
        // reset to starting color
        currentColor.value = colorStore.rgbToHex(colorModel.value)
    }
    newColorApplied = false
    emit('open', false)
}

watch(colorModel, () => {
    if (newColorApplied) return
    currentColor.value = colorStore.rgbToHex(colorModel.value)
})
const handleRedIssue = (newColor: Color): void => {
    // This fixes an issue with a component glitch due to full-red being at both the beginning
    // and end of the UI color spectrum. This works around that issue by telling the component
    // which end of the spectrum to go to.
    if (newColor.toLowerCase() === '#ff0000') {
        currentColor.value = '#ff0001'
        nextTick(() => (currentColor.value = '#ff0000'))
    }
}
</script>

<template>
    <PopoverRoot v-model:open="popoverOpen">
        <PopoverTrigger as-child>
            <div
                v-tooltip.top="{ value: t('layout.menu.tooltips.chooseColor') }"
                class="rounded-lg border-none p-0 text-text-color-secondary outline-0 text-center justify-center items-center flex hover:text-text-color hover:bg-surface-hover cursor-pointer"
                :class="{ 'w-10 h-10': !size }"
                :style="triggerStyle"
                @click.stop
            >
                <svg-icon
                    class="outline-0"
                    type="mdi"
                    :path="mdiPalette"
                    :size="iconSize"
                    :style="{ color: currentColor }"
                />
            </div>
        </PopoverTrigger>
        <PopoverPortal>
            <PopoverContent side="bottom" align="start" class="z-[1300]" @click.stop>
                <div
                    class="mt-2 w-full bg-bg-two border border-border-one p-4 rounded-lg text-text-color shadow-overlay-lg"
                    @click.stop
                >
                    <div>
                        <ChromePicker
                            v-model="currentColor"
                            disable-alpha
                            disable-fields
                            class="!w-[32rem]"
                            @click.stop
                        />
                        <CompactPicker
                            v-model="currentColor"
                            class="!w-[32rem]"
                            :palette="settingsStore.predefinedColorOptions"
                            @update:modelValue="handleRedIssue"
                            @click.stop
                        />
                    </div>
                    <div class="flex flex-row justify-between mt-4 w-full">
                        <UiInput
                            id="property-color"
                            v-model="currentColor"
                            class="w-32"
                            :class="{ '!border-error': !colorStore.isValidHex(currentColor) }"
                            @keydown.enter.prevent="closeAndSave"
                        />
                        <div class="text-right justify-end">
                            <UiButton
                                v-if="defaultColor != null"
                                variant="outline"
                                class="mr-4"
                                @click.stop="resetToDefault"
                            >
                                {{ t('common.reset') }}
                            </UiButton>
                            <UiButton
                                :disabled="!colorStore.isValidHex(currentColor)"
                                @click.stop="closeAndSave"
                            >
                                {{ t('common.save') }}
                            </UiButton>
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </PopoverPortal>
    </PopoverRoot>
</template>

<style lang="scss">
.vc-chrome-picker {
    box-shadow: none !important;
    --vc-body-bg: rgb(var(--colors-bg-two));
}

.vc-chrome-picker .active-color {
    width: 2rem !important;
    height: 2rem !important;
    border-radius: 1rem !important;
}

.vc-chrome-picker .color-wrap {
    width: 3rem !important;
    height: 2rem !important;
}

.vc-chrome-picker .hue-wrap {
    margin-top: 0.625rem !important;
}

.vc-compact-picker {
    box-shadow: none !important;
    justify-items: center;
    --vc-body-bg: rgb(var(--colors-bg-two));
}

.vc-compact-picker .color-item {
    width: 2rem !important;
    height: 2rem !important;
    margin-right: 1rem !important;
    margin-bottom: 0.5rem !important;
    border-radius: 0.5rem !important;
}
</style>
