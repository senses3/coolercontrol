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
import { mdiCheck, mdiContentCopy, mdiExport, mdiImport, mdiRestart } from '@mdi/js'
import { computed, inject, nextTick, onMounted, onUnmounted, type Ref, ref, watch } from 'vue'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { useConfirm } from 'primevue/useconfirm'
import { useRoute } from 'vue-router'
import { useShortcutsDialog } from '@/composables/useShortcutsDialog.ts'
import UiSelect from '@/shell/ui/UiSelect.vue'
import UiSettingRow from '@/shell/ui/UiSettingRow.vue'
import UiSettingsCard from '@/shell/ui/UiSettingsCard.vue'
import UiNumberInput from '@/shell/ui/UiNumberInput.vue'
import UiInput from '@/shell/ui/UiInput.vue'
import UiButton from '@/shell/ui/UiButton.vue'
import { useToast } from 'primevue/usetoast'
import {
    CustomThemeSettings,
    defaultCustomTheme,
    StartupPage,
    ThemeMode,
} from '@/models/UISettings.ts'
import { CoolerControlDeviceSettingsDTO } from '@/models/CCSettings.ts'
import { ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from 'reka-ui'
import { Color } from '@/models/Device.ts'
import { Emitter, EventType } from 'mitt'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import { useI18n } from 'vue-i18n'
import { api as fullscreenApi } from 'vue-fullscreen'
import _ from 'lodash'
import CCColorPicker from '@/components/CCColorPicker.vue'
import { useThemeColorsStore } from '@/stores/ThemeColorsStore.ts'
import UiSwitch from '@/shell/ui/UiSwitch.vue'

const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const colorStore = useThemeColorsStore()
const confirm = useConfirm()
const { openShortcutsDialog } = useShortcutsDialog()
const route = useRoute()
const toast = useToast()
const emitter: Emitter<Record<EventType, any>> = inject('emitter')!

interface Props {
    tabNumber?: string
}

const props = defineProps<Props>()

const { t } = useI18n()

// Panel links land on /settings/:tabNumber; scroll the matching card group
// into view. Numeric values are the legacy tab indexes.
const ANCHOR_IDS: Record<string, string> = {
    '0': 'settings-general',
    general: 'settings-general',
    appearance: 'settings-appearance',
    theme: 'settings-theme',
    '1': 'settings-daemon',
    daemon: 'settings-daemon',
    '2': 'settings-desktop',
    desktop: 'settings-desktop',
}
const scrollToSection = (tab: string | undefined): void => {
    const id = ANCHOR_IDS[tab ?? '']
    if (id == null) return
    nextTick(() =>
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
}
watch(
    () => route.params.tabNumber,
    (tab) => scrollToSection(tab as string | undefined),
)
onMounted(() => scrollToSection(props.tabNumber))

const isFullScreen = ref(fullscreenApi.isFullscreen)
if (deviceStore.isQtApp()) {
    // @ts-ignore
    const ipc = window.ipc
    isFullScreen.value = await ipc.getIsFullScreen()
    ipc.fullScreenToggled.connect((fullscreen: boolean) => {
        isFullScreen.value = fullscreen
    })
}
const toggleFullScreen = async (_enable: string | number | boolean): Promise<void> => {
    await fullscreenApi.toggle(null, {
        callback: async (fullscreen: boolean) => {
            isFullScreen.value = fullscreen
            if (deviceStore.isQtApp()) {
                await deviceStore.sleep(50)
                // @ts-ignore
                const ipc = window.ipc
                isFullScreen.value = await ipc.getIsFullScreen()
            }
        },
    })
}

// Use computed to respond to language changes
const themeModeOptions = computed(() => [
    { value: ThemeMode.SYSTEM, label: t('layout.settings.themeMode.system') },
    { value: ThemeMode.DARK, label: t('layout.settings.themeMode.dark') },
    { value: ThemeMode.LIGHT, label: t('layout.settings.themeMode.light') },
    {
        value: ThemeMode.HIGH_CONTRAST_DARK,
        label: t('layout.settings.themeMode.highContrastDark'),
    },
    {
        value: ThemeMode.HIGH_CONTRAST_LIGHT,
        label: t('layout.settings.themeMode.highContrastLight'),
    },
    { value: ThemeMode.CUSTOM, label: t('layout.settings.themeMode.custom') },
])
const changeThemeMode = async (value: ThemeMode) => {
    if (value === null) {
        return // do not update on unselect
    }

    // Save the original theme mode
    const previousThemeMode = settingsStore.themeMode

    // Update the theme mode in settings store
    settingsStore.themeMode = value

    // Dynamically apply theme changes without page reload
    settingsStore.applyThemeMode()

    // Display success notification
    toast.add({
        severity: 'success',
        summary: t('common.success'),
        detail: t('layout.settings.themeChangeSuccess'),
        life: 2000,
    })

    // Trigger theme change event to notify other components
    window.dispatchEvent(
        new CustomEvent('theme-changed', {
            detail: {
                previousTheme: previousThemeMode,
                currentTheme: value,
            },
        }),
    )
}
const lineThicknessOptions = ref([
    { optionSize: 1, value: 0.5 },
    { optionSize: 2, value: 1.0 },
    { optionSize: 3, value: 1.5 },
    { optionSize: 4, value: 2.0 },
    { optionSize: 6, value: 3.0 },
])
// Enum values are kept for config compatibility; targets remap to the new
// shell sections (AppInfo -> Home, Controls -> Cooling, dashboards -> Monitoring).
const chartLineValue = computed({
    get: () => String(settingsStore.chartLineScale),
    set: (value: string | undefined) => {
        if (value != null) settingsStore.chartLineScale = Number(value)
    },
})
const lineThicknessSelectOptions = computed(() =>
    lineThicknessOptions.value.map((option) => ({
        label: `${option.optionSize}px`,
        value: String(option.value),
        px: option.optionSize,
    })),
)

const startupPageOptions = computed(() => [
    { value: StartupPage.AppInfo, label: t('layout.shell.home') },
    { value: StartupPage.Controls, label: t('layout.shell.cooling') },
    { value: StartupPage.HomeDashboard, label: t('models.startupPage.homeDashboard') },
])
const customThemeAccent: Ref<Color> = ref(colorStore.rgbToHex(settingsStore.customTheme.accent))
const customThemeBgOne: Ref<Color> = ref(colorStore.rgbToHex(settingsStore.customTheme.bgOne))
const customThemeBgTwo: Ref<Color> = ref(colorStore.rgbToHex(settingsStore.customTheme.bgTwo))
const customThemeBorder: Ref<Color> = ref(colorStore.rgbToHex(settingsStore.customTheme.borderOne))
const customThemeText: Ref<Color> = ref(colorStore.rgbToHex(settingsStore.customTheme.textColor))
const customThemeTextSecondary: Ref<Color> = ref(
    colorStore.rgbToHex(settingsStore.customTheme.textColorSecondary),
)

const setNewColorAccent = (newHexColor: Color): void => {
    customThemeAccent.value = newHexColor
    settingsStore.customTheme.accent = colorStore.hexToRgbThemeString(newHexColor)
    document.documentElement.style.setProperty('--colors-accent', settingsStore.customTheme.accent)
    colorStore.reLoadThemeColors()
}
const setNewColorBgOne = (newHexColor: Color): void => {
    customThemeBgOne.value = newHexColor
    settingsStore.customTheme.bgOne = colorStore.hexToRgbThemeString(newHexColor)
    document.documentElement.style.setProperty('--colors-bg-one', settingsStore.customTheme.bgOne)
    colorStore.reLoadThemeColors()
}
const setNewColorBgTwo = (newHexColor: Color): void => {
    customThemeBgTwo.value = newHexColor
    settingsStore.customTheme.bgTwo = colorStore.hexToRgbThemeString(newHexColor)
    document.documentElement.style.setProperty('--colors-bg-two', settingsStore.customTheme.bgTwo)
    colorStore.reLoadThemeColors()
}
const setNewColorBorder = (newHexColor: Color): void => {
    customThemeBorder.value = newHexColor
    settingsStore.customTheme.borderOne = colorStore.hexToRgbThemeString(newHexColor)
    document.documentElement.style.setProperty(
        '--colors-border-one',
        settingsStore.customTheme.borderOne,
    )
    colorStore.reLoadThemeColors()
}
const setNewColorText = (newHexColor: Color): void => {
    customThemeText.value = newHexColor
    settingsStore.customTheme.textColor = colorStore.hexToRgbThemeString(newHexColor)
    document.documentElement.style.setProperty(
        '--colors-text-color',
        settingsStore.customTheme.textColor,
    )
    colorStore.reLoadThemeColors()
}
const setNewColorTextSecondary = (newHexColor: Color): void => {
    customThemeTextSecondary.value = newHexColor
    settingsStore.customTheme.textColorSecondary = colorStore.hexToRgbThemeString(newHexColor)
    document.documentElement.style.setProperty(
        '--colors-text-color-secondary',
        settingsStore.customTheme.textColorSecondary,
    )
    colorStore.reLoadThemeColors()
}

const blacklistedDevices: Ref<Array<CoolerControlDeviceSettingsDTO>> = ref([])
for (const deviceSettings of settingsStore.ccBlacklistedDevices.values()) {
    blacklistedDevices.value.push(deviceSettings)
}
const applyGenericDaemonChange = _.debounce(
    () =>
        confirm.require({
            message: t('layout.settings.applySettingAndRestart'),
            header: t('layout.settings.restartHeader'),
            icon: 'pi pi-exclamation-triangle',
            defaultFocus: 'accept',
            acceptLabel: t('common.yes'),
            rejectLabel: t('common.no'),
            accept: async () => {
                settingsStore.ccSettings.poll_rate = pollRate.value
                // give the system a moment to make sure the pollRate has been saved ^
                await deviceStore.sleep(50)
                toast.add({
                    severity: 'success',
                    summary: t('layout.settings.success'),
                    detail: t('layout.settings.successDetail'),
                    life: 6000,
                })
                await deviceStore.daemonClient.shutdownDaemon()
                await deviceStore.waitAndReload()
            },
        }),
    2000,
)

// Boolean views over non-boolean settings for the kit switch.
const frequencyGhz = computed({
    get: () => settingsStore.frequencyPrecision === 1000,
    set: (value: boolean) => (settingsStore.frequencyPrecision = value ? 1000 : 1),
})
const liquidctlInit = computed({
    get: () => !settingsStore.ccSettings.no_init,
    set: (value: boolean) => (settingsStore.ccSettings.no_init = !value),
})

const pollRate: Ref<number> = ref(settingsStore.ccSettings.poll_rate)
watch(pollRate, () => {
    applyGenericDaemonChange()
})

// This interface is used for exporting/importing custom HEX color themes
// We transition to and from the CustomThemeSettings interface which contains
// a 'R G B' string value.
interface CustomColorTheme extends CustomThemeSettings {}
class CustomColorTheme {
    static fromCustomThemeSettings(customThemeSettings: CustomThemeSettings): CustomColorTheme {
        const customColorTheme = new CustomColorTheme()
        customColorTheme.accent = colorStore.rgbToHex(customThemeSettings.accent)
        customColorTheme.bgOne = colorStore.rgbToHex(customThemeSettings.bgOne)
        customColorTheme.bgTwo = colorStore.rgbToHex(customThemeSettings.bgTwo)
        customColorTheme.borderOne = colorStore.rgbToHex(customThemeSettings.borderOne)
        customColorTheme.textColor = colorStore.rgbToHex(customThemeSettings.textColor)
        customColorTheme.textColorSecondary = colorStore.rgbToHex(
            customThemeSettings.textColorSecondary,
        )
        return customColorTheme
    }

    static fromJson(jsonObj: any): CustomColorTheme {
        if (CustomColorTheme.isCustomThemeSettings(jsonObj)) {
            return CustomColorTheme.fromCustomThemeSettings(jsonObj)
        }
        throw new Error('Invalid JSON object for CustomColorTheme')
    }

    static isCustomThemeSettings(jsonObj: any): jsonObj is CustomThemeSettings {
        return (
            typeof jsonObj.accent === 'string' &&
            colorStore.isValidHex(jsonObj.accent) &&
            typeof jsonObj.bgOne === 'string' &&
            colorStore.isValidHex(jsonObj.bgOne) &&
            typeof jsonObj.bgTwo === 'string' &&
            colorStore.isValidHex(jsonObj.bgTwo) &&
            typeof jsonObj.borderOne === 'string' &&
            colorStore.isValidHex(jsonObj.borderOne) &&
            typeof jsonObj.textColor === 'string' &&
            colorStore.isValidHex(jsonObj.textColor) &&
            typeof jsonObj.textColorSecondary === 'string' &&
            colorStore.isValidHex(jsonObj.textColorSecondary)
        )
    }

    applyCustomColorTheme(): void {
        setNewColorAccent(this.accent)
        setNewColorBgOne(this.bgOne)
        setNewColorBgTwo(this.bgTwo)
        setNewColorBorder(this.borderOne)
        setNewColorText(this.textColor)
        setNewColorTextSecondary(this.textColorSecondary)
    }
}
// Theme code: cct1:<36 hex chars>[<2 hex chars CRC-8>]
// Output always includes the checksum; input accepts with or without.
const THEME_CODE_PREFIX = 'cct1:'

const crc8 = (bytes: Uint8Array): number => {
    let crc = 0
    for (const byte of bytes) {
        crc ^= byte
        for (let i = 0; i < 8; i++) {
            crc = (crc & 0x80) !== 0 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff
        }
    }
    return crc
}

const colorToHexBody = (c: Color): string => {
    const hex = colorStore.rgbToHex(c).toLowerCase()
    return hex.startsWith('#') ? hex.slice(1) : hex
}

const encodeThemeCode = (theme: CustomThemeSettings): string => {
    const hex = [
        colorToHexBody(theme.accent),
        colorToHexBody(theme.bgOne),
        colorToHexBody(theme.bgTwo),
        colorToHexBody(theme.borderOne),
        colorToHexBody(theme.textColor),
        colorToHexBody(theme.textColorSecondary),
    ].join('')
    const bytes = new Uint8Array(18)
    for (let i = 0; i < 18; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    }
    const cs = crc8(bytes).toString(16).padStart(2, '0')
    return THEME_CODE_PREFIX + hex + cs
}

const decodeThemeCode = (input: string): CustomColorTheme | null => {
    const trimmed = input.trim().toLowerCase()
    if (!trimmed.startsWith(THEME_CODE_PREFIX)) return null
    const body = trimmed.slice(THEME_CODE_PREFIX.length)
    let hex: string
    if (body.length === 36) {
        hex = body
    } else if (body.length === 38) {
        hex = body.slice(0, 36)
        if (!/^[0-9a-f]{36}$/.test(hex)) return null
        const expected = body.slice(36)
        const bytes = new Uint8Array(18)
        for (let i = 0; i < 18; i++) {
            bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
        }
        if (crc8(bytes).toString(16).padStart(2, '0') !== expected) return null
    } else {
        return null
    }
    if (!/^[0-9a-f]{36}$/.test(hex)) return null
    const theme = new CustomColorTheme()
    theme.accent = '#' + hex.slice(0, 6)
    theme.bgOne = '#' + hex.slice(6, 12)
    theme.bgTwo = '#' + hex.slice(12, 18)
    theme.borderOne = '#' + hex.slice(18, 24)
    theme.textColor = '#' + hex.slice(24, 30)
    theme.textColorSecondary = '#' + hex.slice(30, 36)
    return theme
}

const themeCode = computed((): string => encodeThemeCode(settingsStore.customTheme))

const pasteCodeInput: Ref<string> = ref('')
const justCopied: Ref<boolean> = ref(false)

const copyThemeCode = async (): Promise<void> => {
    try {
        await navigator.clipboard.writeText(themeCode.value)
        justCopied.value = true
        setTimeout(() => (justCopied.value = false), 1500)
        toast.add({
            severity: 'success',
            summary: t('common.success'),
            detail: t('layout.settings.customTheme.themeCodeCopied'),
            life: 2000,
        })
    } catch (e) {
        console.error('Clipboard write failed', e)
        toast.add({
            severity: 'error',
            summary: t('common.error'),
            detail: t('layout.settings.customTheme.invalidThemeCode'),
            life: 3000,
        })
    }
}

const applyPastedThemeCode = (): void => {
    const decoded = decodeThemeCode(pasteCodeInput.value)
    if (decoded == null) {
        toast.add({
            severity: 'error',
            summary: t('common.error'),
            detail: t('layout.settings.customTheme.invalidThemeCode'),
            life: 3000,
        })
        return
    }
    decoded.applyCustomColorTheme()
    pasteCodeInput.value = ''
    toast.add({
        severity: 'success',
        summary: t('common.success'),
        detail: t('layout.settings.customTheme.themeApplied'),
        life: 2000,
    })
}

const downloadThemeFileName = 'coolercontrol-color-theme.json'
const downloadThemeHref = computed((): string => {
    const customColorTheme = CustomColorTheme.fromCustomThemeSettings(settingsStore.customTheme)
    const blob = new Blob([JSON.stringify(customColorTheme)], { type: 'application/json' })
    return URL.createObjectURL(blob)
})
const downloadThemeDatasetURL = computed((): string => {
    return ['application/json', downloadThemeFileName, downloadThemeHref].join(':')
})
const createJsonUploader = (): void => {
    const inputFileElement = document.createElement('input')
    inputFileElement.setAttribute('type', 'file')
    inputFileElement.setAttribute('accept', '.json')
    inputFileElement.onchange = function () {
        getUploadedJson(this)
    }
    document.body.appendChild(inputFileElement)
    inputFileElement.click()
    inputFileElement.remove()
}
const getUploadedJson = (fileInput: any) => {
    const files = fileInput.files
    if (files.length <= 0) return
    const file = files[0]
    if (file.size > 1024) {
        console.error('JSON File too large for single Color Theme')
        return
    }
    file.text().then(function (text: string) {
        console.log('text', text)
        const result = JSON.parse(text)
        const customThemeSettings = CustomColorTheme.fromJson(result)
        customThemeSettings.applyCustomColorTheme()
        // const formatted = JSON.stringify(result, null, 2)
        // console.log('result', formatted)
    })
}

onMounted(() => {
    // Listen for language change events
    window.addEventListener('language-changed', () => {
        // When language changes, the computed property will automatically update, no need to manually assign value
        // themeModeOptions.value = [...] - this line would cause an error

        // Trigger theme options recalculation
        window.dispatchEvent(new CustomEvent('theme-options-updated'))
    })
})

// Remove event listeners when component is unmounted
onUnmounted(() => {
    window.removeEventListener('language-changed', () => {
        // Cleanup code
    })
})
</script>

<template>
    <div class="flex h-[3.5rem] border-b-4 border-border-one items-center justify-between">
        <div class="pl-4 py-2 text-2xl font-bold">{{ t('layout.settings.title') }}</div>
    </div>
    <ScrollAreaRoot style="--scrollbar-size: 10px">
        <ScrollAreaViewport class="pb-16 h-screen w-full">
            <div class="columns-1 gap-4 space-y-4 p-4 xl:columns-2 min-[1900px]:columns-3">
                <UiSettingsCard
                    id="settings-general"
                    class="break-inside-avoid"
                    :title="t('layout.settings.general')"
                >
                    <UiSettingRow v-tooltip.top="t('layout.settings.tooltips.introduction')">
                        <template #label>{{ t('layout.settings.introduction') }}</template>
                        <UiButton class="w-full" @click="emitter.emit('start-tour')">{{
                            t('layout.settings.startTour')
                        }}</UiButton>
                    </UiSettingRow>
                    <UiSettingRow :label="t('views.shortcuts.shortcuts')">
                        <UiButton variant="outline" class="w-full" @click="openShortcutsDialog()">{{
                            t('views.shortcuts.shortcuts')
                        }}</UiButton>
                    </UiSettingRow>
                    <UiSettingRow
                        v-tooltip.top="t('layout.settings.tooltips.startupPage')"
                        :label="t('layout.settings.startupPage')"
                    >
                        <UiSelect
                            v-model="settingsStore.startupPage"
                            :options="startupPageOptions"
                            class="w-full"
                        />
                    </UiSettingRow>
                    <UiSettingRow v-tooltip.top="t('layout.settings.language')">
                        <template #label>{{ t('layout.settings.language') }}</template>
                        <LanguageSwitcher />
                    </UiSettingRow>
                    <UiSettingRow
                        v-tooltip.top="t('layout.settings.tooltips.fullScreen')"
                        :label="t('layout.settings.fullScreen')"
                    >
                        <UiSwitch
                            v-model="isFullScreen"
                            :disabled="!fullscreenApi.isEnabled"
                            @update:model-value="toggleFullScreen"
                        />
                    </UiSettingRow>
                </UiSettingsCard>
                <UiSettingsCard
                    id="settings-appearance"
                    class="break-inside-avoid"
                    :title="t('layout.settings.appearance')"
                >
                    <UiSettingRow v-tooltip.top="t('layout.settings.appearance')">
                        <template #label>{{ t('layout.settings.themeStyle') }}</template>
                        <div
                            class="flex min-w-[12rem] flex-col gap-0.5 rounded-lg border-2 border-border-one bg-bg-one p-1 text-left"
                        >
                            <button
                                v-for="option in themeModeOptions"
                                :key="option.value"
                                type="button"
                                class="flex items-center gap-2 rounded-md px-2 py-1.5 text-base text-text-color outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
                                :class="{
                                    'bg-surface-hover': settingsStore.themeMode === option.value,
                                }"
                                @click="changeThemeMode(option.value)"
                            >
                                <svg-icon
                                    type="mdi"
                                    :path="mdiCheck"
                                    :size="14"
                                    :class="
                                        settingsStore.themeMode === option.value
                                            ? 'text-accent'
                                            : 'invisible'
                                    "
                                />
                                {{ option.label }}
                            </button>
                        </div>
                    </UiSettingRow>
                    <UiSettingRow
                        v-tooltip.top="t('layout.settings.tooltips.lineThickness')"
                        :label="t('layout.settings.dashboardLineSize')"
                    >
                        <UiSelect
                            v-model="chartLineValue"
                            :options="lineThicknessSelectOptions"
                            class="w-full"
                        >
                            <template #option="{ option }">
                                <span class="flex w-full items-center gap-3">
                                    <span
                                        class="block w-16 rounded bg-text-color"
                                        :style="{
                                            height: `${(option as any).px}px`,
                                        }"
                                    />
                                    {{ option.label }}
                                </span>
                            </template>
                        </UiSelect>
                    </UiSettingRow>
                    <UiSettingRow
                        v-tooltip.top="t('layout.settings.tooltips.timeFormat')"
                        :label="t('layout.settings.timeFormat')"
                    >
                        <span class="inline-flex items-center justify-center gap-2">
                            <span>{{ t('layout.settings.time12h') }}</span>
                            <UiSwitch v-model="settingsStore.time24" two-sided />
                            <span>{{ t('layout.settings.time24h') }}</span>
                        </span>
                    </UiSettingRow>
                    <UiSettingRow
                        v-tooltip.top="t('layout.settings.tooltips.frequencyPrecision')"
                        :label="t('layout.settings.frequencyPrecision')"
                    >
                        <span class="inline-flex items-center justify-center gap-2">
                            <span>{{ t('common.mhzAbbr') }}</span>
                            <UiSwitch v-model="frequencyGhz" two-sided />
                            <span>{{ t('common.ghzAbbr') }}</span>
                        </span>
                    </UiSettingRow>
                    <UiSettingRow
                        v-tooltip.top="t('layout.settings.tooltips.sidebarCollapse')"
                        :label="t('layout.settings.sidebarToCollapse')"
                    >
                        <UiSwitch v-model="settingsStore.hideMenuCollapseIcon" />
                    </UiSettingRow>
                    <UiSettingRow
                        v-tooltip.top="t('layout.settings.tooltips.eyeCandy')"
                        :label="t('layout.settings.eyeCandy')"
                    >
                        <UiSwitch v-model="settingsStore.eyeCandy" />
                    </UiSettingRow>
                </UiSettingsCard>
                <UiSettingsCard
                    id="settings-theme"
                    v-if="settingsStore.themeMode === ThemeMode.CUSTOM"
                    class="break-inside-avoid"
                    :title="t('layout.settings.customTheme.title')"
                >
                    <UiSettingRow :label="t('layout.settings.customTheme.accent')">
                        <div class="w-full h-full content-center flex justify-center">
                            <c-c-color-picker
                                v-model="customThemeAccent"
                                color-format="hex"
                                :default-color="colorStore.rgbToHex(defaultCustomTheme.accent)"
                                @update:model-value="setNewColorAccent"
                            />
                        </div>
                    </UiSettingRow>
                    <UiSettingRow :label="t('layout.settings.customTheme.bgOne')">
                        <div class="w-full h-full content-center flex justify-center">
                            <c-c-color-picker
                                v-model="customThemeBgOne"
                                color-format="hex"
                                :default-color="colorStore.rgbToHex(defaultCustomTheme.bgOne)"
                                @update:model-value="setNewColorBgOne"
                            />
                        </div>
                    </UiSettingRow>
                    <UiSettingRow :label="t('layout.settings.customTheme.bgTwo')">
                        <div class="w-full h-full content-center flex justify-center">
                            <div class="rounded-lg bg-bg-one">
                                <c-c-color-picker
                                    v-model="customThemeBgTwo"
                                    color-format="hex"
                                    :default-color="colorStore.rgbToHex(defaultCustomTheme.bgTwo)"
                                    @update:model-value="setNewColorBgTwo"
                                />
                            </div>
                        </div>
                    </UiSettingRow>
                    <UiSettingRow :label="t('layout.settings.customTheme.border')">
                        <div class="w-full h-full content-center flex justify-center">
                            <c-c-color-picker
                                v-model="customThemeBorder"
                                color-format="hex"
                                :default-color="colorStore.rgbToHex(defaultCustomTheme.borderOne)"
                                @update:model-value="setNewColorBorder"
                            />
                        </div>
                    </UiSettingRow>
                    <UiSettingRow :label="t('layout.settings.customTheme.text')">
                        <div class="w-full h-full content-center flex justify-center">
                            <c-c-color-picker
                                v-model="customThemeText"
                                color-format="hex"
                                :default-color="colorStore.rgbToHex(defaultCustomTheme.textColor)"
                                @update:model-value="setNewColorText"
                            />
                        </div>
                    </UiSettingRow>
                    <UiSettingRow :label="t('layout.settings.customTheme.textSecondary')">
                        <div class="w-full h-full content-center flex justify-center">
                            <c-c-color-picker
                                v-model="customThemeTextSecondary"
                                color-format="hex"
                                :default-color="
                                    colorStore.rgbToHex(defaultCustomTheme.textColorSecondary)
                                "
                                @update:model-value="setNewColorTextSecondary"
                            />
                        </div>
                    </UiSettingRow>
                    <div
                        v-tooltip.top="t('layout.settings.tooltips.copyThemeCode')"
                        class="px-4 py-3"
                    >
                        <div class="flex items-center gap-2 w-full">
                            <div class="pr-4 text-right">
                                {{ t('layout.settings.customTheme.copyCode') }}
                            </div>
                            <UiInput
                                :model-value="themeCode"
                                readonly
                                class="flex-1 font-mono text-xs"
                                @focus="($event.target as HTMLInputElement).select()"
                            />
                            <UiButton size="icon" @click="copyThemeCode">
                                <svg-icon
                                    class="shrink-0 outline-0"
                                    type="mdi"
                                    :path="justCopied ? mdiCheck : mdiContentCopy"
                                    :size="deviceStore.getREMSize(1.25)"
                                />
                            </UiButton>
                        </div>
                    </div>
                    <div
                        v-tooltip.top="t('layout.settings.tooltips.pasteThemeCode')"
                        class="px-4 py-3"
                    >
                        <div class="flex items-center gap-2 w-full">
                            <div class="pr-4 text-right">
                                {{ t('layout.settings.customTheme.pasteCode') }}
                            </div>
                            <UiInput
                                v-model="pasteCodeInput"
                                class="flex-1 font-mono text-xs"
                                placeholder="cct1:..."
                                @keyup.enter="applyPastedThemeCode"
                            />
                            <UiButton
                                size="icon"
                                :disabled="pasteCodeInput.trim().length === 0"
                                @click="applyPastedThemeCode"
                            >
                                <svg-icon
                                    class="shrink-0 outline-0"
                                    type="mdi"
                                    :path="mdiImport"
                                    :size="deviceStore.getREMSize(1.5)"
                                />
                            </UiButton>
                        </div>
                    </div>
                    <UiSettingRow v-tooltip.top="t('layout.settings.tooltips.exportThemeFile')">
                        <template #label>{{ t('layout.settings.customTheme.export') }}</template>
                        <div class="w-full h-full content-center flex justify-center">
                            <a
                                :href="downloadThemeHref"
                                :download="downloadThemeFileName"
                                :data-downloadurl="downloadThemeDatasetURL"
                                class="w-full"
                            >
                                <UiButton class="w-full">
                                    <svg-icon
                                        class="outline-0"
                                        type="mdi"
                                        :path="mdiExport"
                                        :size="deviceStore.getREMSize(1.625)"
                                    />
                                </UiButton>
                            </a>
                        </div>
                    </UiSettingRow>
                    <UiSettingRow v-tooltip.top="t('layout.settings.tooltips.importThemeFile')">
                        <template #label>{{ t('layout.settings.customTheme.import') }}</template>
                        <div class="w-full h-full content-center flex justify-center">
                            <UiButton class="w-full" @click="createJsonUploader">
                                <svg-icon
                                    class="outline-0"
                                    type="mdi"
                                    :path="mdiImport"
                                    :size="deviceStore.getREMSize(1.625)"
                                />
                            </UiButton>
                        </div>
                    </UiSettingRow>
                </UiSettingsCard>
                <UiSettingsCard
                    id="settings-daemon"
                    class="break-inside-avoid"
                    :title="t('views.daemon.title')"
                >
                    <UiSettingRow
                        v-tooltip.top="{
                            escape: false,
                            value: t('layout.settings.tooltips.applySettingsOnStartup'),
                        }"
                        :label="t('layout.settings.applySettingsOnStartup')"
                    >
                        <UiSwitch v-model="settingsStore.ccSettings.apply_on_boot" />
                    </UiSettingRow>
                    <UiSettingRow
                        v-tooltip.top="{
                            escape: false,
                            value: t('layout.settings.tooltips.deviceDelayAtStartup'),
                        }"
                        :label="t('layout.settings.deviceDelayAtStartup')"
                    >
                        <UiNumberInput
                            v-model="settingsStore.ccSettings.startup_delay"
                            :min="1"
                            :max="30"
                            :suffix="t('common.secondAbbr')"
                        />
                    </UiSettingRow>
                    <UiSettingRow
                        v-tooltip.top="{
                            escape: false,
                            value: t('layout.settings.tooltips.pollingRate'),
                        }"
                    >
                        <template #label
                            ><div
                                v-tooltip.top="t('layout.settings.tooltips.triggersDaemonRestart')"
                            >
                                <svg-icon
                                    type="mdi"
                                    :path="mdiRestart"
                                    :size="deviceStore.getREMSize(1.1)"
                                />
                            </div>
                            <div>
                                {{ t('layout.settings.pollingRate') }}
                            </div></template
                        >
                        <UiNumberInput
                            v-model="pollRate"
                            :min="0.5"
                            :max="5.0"
                            :step="0.5"
                            :suffix="t('common.secondAbbr')"
                        />
                    </UiSettingRow>
                    <UiSettingRow
                        v-tooltip.top="{
                            escape: false,
                            value: t('layout.settings.tooltips.compressApiPayload'),
                        }"
                    >
                        <template #label
                            ><div
                                v-tooltip.top="t('layout.settings.tooltips.triggersDaemonRestart')"
                            >
                                <svg-icon
                                    type="mdi"
                                    :path="mdiRestart"
                                    :size="deviceStore.getREMSize(1.0)"
                                />
                            </div>
                            <div>
                                {{ t('layout.settings.compressApiPayload') }}
                            </div></template
                        >
                        <UiSwitch
                            v-model="settingsStore.ccSettings.compress"
                            @click="applyGenericDaemonChange"
                        />
                    </UiSettingRow>
                    <UiSettingRow
                        v-tooltip.top="{
                            escape: false,
                            value: t('layout.settings.tooltips.sensorsAutoDetect'),
                        }"
                    >
                        <template #label
                            ><div
                                v-tooltip.top="t('layout.settings.tooltips.triggersDaemonRestart')"
                            >
                                <svg-icon
                                    type="mdi"
                                    :path="mdiRestart"
                                    :size="deviceStore.getREMSize(1.0)"
                                />
                            </div>
                            <div>
                                {{ t('layout.settings.sensorsAutoDetect') }}
                            </div></template
                        >
                        <UiSwitch
                            v-model="settingsStore.ccSettings.sensors_auto_detect"
                            @update:model-value="applyGenericDaemonChange"
                        />
                    </UiSettingRow>
                    <UiSettingRow
                        v-tooltip.top="{
                            escape: false,
                            value: t('layout.settings.tooltips.deviceListener'),
                        }"
                    >
                        <template #label
                            ><div
                                v-tooltip.top="t('layout.settings.tooltips.triggersDaemonRestart')"
                            >
                                <svg-icon
                                    type="mdi"
                                    :path="mdiRestart"
                                    :size="deviceStore.getREMSize(1.0)"
                                />
                            </div>
                            <div>
                                {{ t('layout.settings.deviceListener') }}
                            </div></template
                        >
                        <UiSwitch
                            v-model="settingsStore.ccSettings.device_listener_enabled"
                            @update:model-value="applyGenericDaemonChange"
                        />
                    </UiSettingRow>
                    <UiSettingRow
                        v-tooltip.top="{
                            escape: false,
                            value: t('layout.settings.tooltips.liquidctlIntegration'),
                        }"
                    >
                        <template #label
                            ><div
                                class="flex items-center"
                                v-tooltip.top="t('layout.settings.tooltips.triggersDaemonRestart')"
                            >
                                <svg-icon
                                    type="mdi"
                                    :path="mdiRestart"
                                    :size="deviceStore.getREMSize(1.0)"
                                />
                            </div>
                            <div>
                                {{ t('layout.settings.liquidctlIntegration') }}
                            </div></template
                        >
                        <UiSwitch
                            v-model="settingsStore.ccSettings.liquidctl_integration"
                            @update:model-value="applyGenericDaemonChange"
                        />
                    </UiSettingRow>
                    <UiSettingRow
                        v-tooltip.top="{
                            escape: false,
                            value: t('layout.settings.tooltips.liquidctlDeviceInit'),
                        }"
                        :label="t('layout.settings.liquidctlDeviceInit')"
                    >
                        <UiSwitch
                            v-model="liquidctlInit"
                            :disabled="!settingsStore.ccSettings.liquidctl_integration"
                        />
                    </UiSettingRow>
                    <UiSettingRow
                        v-tooltip.top="{
                            escape: false,
                            value: t('layout.settings.tooltips.hideDuplicateDevices'),
                        }"
                    >
                        <template #label
                            ><div
                                v-tooltip.top="t('layout.settings.tooltips.triggersDaemonRestart')"
                            >
                                <svg-icon
                                    type="mdi"
                                    :path="mdiRestart"
                                    :size="deviceStore.getREMSize(1.0)"
                                />
                            </div>
                            <div>
                                {{ t('layout.settings.hideDuplicateDevices') }}
                            </div></template
                        >
                        <UiSwitch
                            v-model="settingsStore.ccSettings.hide_duplicate_devices"
                            :disabled="!settingsStore.ccSettings.liquidctl_integration"
                            @update:model-value="applyGenericDaemonChange"
                        />
                    </UiSettingRow>
                    <UiSettingRow
                        v-tooltip.top="{
                            escape: false,
                            value: t('layout.settings.tooltips.drivePowerState'),
                        }"
                    >
                        <template #label
                            ><div v-tooltip.top="'Triggers an automatic daemon restart'">
                                <svg-icon
                                    type="mdi"
                                    :path="mdiRestart"
                                    :size="deviceStore.getREMSize(1.0)"
                                />
                            </div>
                            <div>
                                {{ t('layout.settings.drivePowerState') }}
                            </div></template
                        >
                        <UiSwitch
                            v-model="settingsStore.ccSettings.drivetemp_suspend"
                            @update:model-value="applyGenericDaemonChange"
                        />
                    </UiSettingRow>
                </UiSettingsCard>
                <UiSettingsCard
                    id="settings-desktop"
                    v-if="deviceStore.isQtApp()"
                    class="break-inside-avoid"
                    :title="t('layout.settings.desktop')"
                >
                    <UiSettingRow
                        v-tooltip.top="{
                            escape: false,
                            value: t('layout.settings.tooltips.startInTray'),
                        }"
                        :label="t('layout.settings.startInTray')"
                    >
                        <UiSwitch v-model="settingsStore.startInSystemTray" />
                    </UiSettingRow>
                    <UiSettingRow
                        v-tooltip.top="{
                            escape: false,
                            value: t('layout.settings.tooltips.closeToTray'),
                        }"
                        :label="t('layout.settings.closeToTray')"
                    >
                        <UiSwitch v-model="settingsStore.closeToSystemTray" />
                    </UiSettingRow>
                    <UiSettingRow
                        v-tooltip.top="{
                            escape: false,
                            value: t('layout.settings.tooltips.zoom'),
                        }"
                        :label="t('layout.settings.zoom')"
                    >
                        <UiNumberInput
                            v-model="settingsStore.uiScale"
                            :min="50"
                            :max="400"
                            :step="10"
                            :suffix="t('common.percentUnit')"
                        />
                    </UiSettingRow>
                    <UiSettingRow
                        v-tooltip.top="{
                            escape: false,
                            value: t('layout.settings.tooltips.desktopStartupDelay'),
                        }"
                        :label="t('layout.settings.desktopStartupDelay')"
                    >
                        <UiNumberInput
                            v-model="settingsStore.desktopStartupDelay"
                            :min="0"
                            :max="10"
                            :step="1"
                            :suffix="t('common.secondAbbr')"
                        />
                    </UiSettingRow>
                </UiSettingsCard>
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

<style scoped lang="scss"></style>

<style lang="scss">
.el-tree-node__content {
    border-radius: 0.5rem;
}

.el-tree-node__expand-icon {
    font-size: 1rem;
    padding-left: 1px !important;
}
</style>
