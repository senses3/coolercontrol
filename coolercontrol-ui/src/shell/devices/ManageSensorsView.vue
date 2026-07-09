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
import { mdiCheckboxBlankOutline, mdiCheckboxMarked } from '@mdi/js'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { type Device, DeviceType, getDeviceTypeDisplayName, type UID } from '@/models/Device.ts'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { useDeviceActions } from '@/composables/useDeviceActions.ts'
import {
    deviceTypeGroups,
    hardwareDevices,
    type SensorToggle,
    sensorToggles,
} from '@/shell/devices/devices.ts'
import UiButton from '@/shell/ui/UiButton.vue'
import UiSwitch from '@/shell/ui/UiSwitch.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const deviceActions = useDeviceActions()

// Custom sensors are created and removed on their own device page, not toggled
// here, so they are excluded from the bulk editor.
const editableDevices = computed(() =>
    hardwareDevices(deviceStore.allDevices()).filter(
        (device) => device.type !== DeviceType.CUSTOM_SENSORS,
    ),
)
const typeGroups = computed(() => deviceTypeGroups(editableDevices.value))

// Fully-disabled devices are not reported by the daemon, so they only carry a
// name and a re-enable toggle here; their sensors return on restart.
const disabledDevices = computed(() =>
    [...settingsStore.ccDeviceSettings.values()].filter(
        (setting) => setting.disable && setting.uid !== undefined,
    ),
)

const disabledChannelNames = (deviceUID: UID): string[] => {
    const names: string[] = []
    for (const [channelName, channelSettings] of settingsStore.ccDeviceSettings.get(deviceUID)
        ?.channel_settings ?? []) {
        if (channelSettings.disabled) names.push(channelName)
    }
    return names
}
const togglesFor = (device: Device): SensorToggle[] =>
    sensorToggles(device, disabledChannelNames(device.uid))

// Current UI state. Live devices default enabled with sensors from their
// toggles; disabled devices default off. Compared against the store to derive
// what changed.
const deviceEnabled = ref<Map<UID, boolean>>(new Map())
const sensorEnabled = ref<Map<UID, Map<string, boolean>>>(new Map())

const resetState = (): void => {
    const de = new Map<UID, boolean>()
    const se = new Map<UID, Map<string, boolean>>()
    for (const device of editableDevices.value) {
        de.set(device.uid, true)
        se.set(device.uid, new Map(togglesFor(device).map((tog) => [tog.channelName, tog.enabled])))
    }
    for (const setting of disabledDevices.value) {
        de.set(setting.uid, false)
    }
    deviceEnabled.value = de
    sensorEnabled.value = se
}
resetState()

const deviceInitialEnabled = (deviceUID: UID): boolean =>
    !(settingsStore.ccDeviceSettings.get(deviceUID)?.disable ?? false)
const isDeviceEnabled = (deviceUID: UID): boolean => deviceEnabled.value.get(deviceUID) ?? true
const isSensorEnabled = (deviceUID: UID, channelName: string): boolean =>
    sensorEnabled.value.get(deviceUID)?.get(channelName) ?? true

const setDeviceEnabled = (deviceUID: UID, value: boolean): void => {
    deviceEnabled.value.set(deviceUID, value)
}
const toggleSensor = (deviceUID: UID, channelName: string): void => {
    const map = sensorEnabled.value.get(deviceUID)
    if (map != null) map.set(channelName, !(map.get(channelName) ?? true))
}

const deviceLabel = (deviceUID: UID): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.name ??
    settingsStore.ccDeviceSettings.get(deviceUID)?.name ??
    deviceUID
const deviceColor = (deviceUID: UID): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.userColor || 'rgb(var(--colors-text-color))'
const sensorLabel = (deviceUID: UID, channelName: string): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.sensorsAndChannels.get(channelName)?.name ??
    settingsStore.ccDeviceSettings.get(deviceUID)?.channel_settings.get(channelName)?.label ??
    channelName

// Only changed devices are saved; a device is dirty when its enable state
// changed or (while enabled) any of its sensors changed.
const edits = computed(() => {
    const map = new Map<UID, { deviceEnabled: boolean; channelStates: Map<string, boolean> }>()
    for (const device of editableDevices.value) {
        const uid = device.uid
        const enabled = isDeviceEnabled(uid)
        const enabledChanged = enabled !== deviceInitialEnabled(uid)
        const toggles = togglesFor(device)
        const sensorsChanged =
            enabled && toggles.some((tog) => isSensorEnabled(uid, tog.channelName) !== tog.enabled)
        if (enabledChanged || sensorsChanged) {
            const channelStates = new Map(
                toggles.map((tog) => [tog.channelName, isSensorEnabled(uid, tog.channelName)]),
            )
            map.set(uid, { deviceEnabled: enabled, channelStates })
        }
    }
    for (const setting of disabledDevices.value) {
        if (isDeviceEnabled(setting.uid)) {
            map.set(setting.uid, { deviceEnabled: true, channelStates: new Map() })
        }
    }
    return map
})

const changeCount = computed(() => {
    let count = 0
    for (const device of editableDevices.value) {
        const uid = device.uid
        if (isDeviceEnabled(uid) !== deviceInitialEnabled(uid)) count += 1
        if (isDeviceEnabled(uid)) {
            for (const tog of togglesFor(device)) {
                if (isSensorEnabled(uid, tog.channelName) !== tog.enabled) count += 1
            }
        }
    }
    for (const setting of disabledDevices.value) {
        if (isDeviceEnabled(setting.uid)) count += 1
    }
    return count
})

const apply = (): void => {
    if (edits.value.size === 0) return
    deviceActions.applySensorChangesBatch(edits.value, (success) => {
        if (!success) resetState()
    })
}
const cancel = (): void => {
    router.push({ name: 'section-devices' })
}

// Deep link ?device=<uid> from a device page: scroll to and briefly highlight
// that device's card.
const highlightUID = ref<UID | null>(null)
onMounted(async () => {
    const target = route.query.device
    if (typeof target !== 'string') return
    await nextTick()
    document.getElementById(`ms-${target}`)?.scrollIntoView({ block: 'center' })
    highlightUID.value = target
    setTimeout(() => {
        if (highlightUID.value === target) highlightUID.value = null
    }, 2500)
})
</script>

<template>
    <div class="flex h-full flex-col">
        <div class="flex items-center gap-3 px-4 pt-4">
            <RouterLink
                :to="{ name: 'section-devices' }"
                class="text-base text-text-color-secondary outline-none hover:text-text-color focus-visible:text-text-color"
            >
                &lsaquo; {{ t('layout.shell.devices') }}
            </RouterLink>
            <h1 class="text-xl font-semibold text-text-color">
                {{ t('layout.shell.manageSensors.title') }}
            </h1>
            <span class="text-sm text-text-color-secondary">
                {{ t('layout.shell.manageSensors.hint') }}
            </span>
        </div>

        <div class="flex-1 overflow-y-auto px-4 pb-4">
            <section v-for="group in typeGroups" :key="group.type" class="pt-4">
                <h2
                    class="pb-2 text-sm font-medium uppercase tracking-wide text-text-color-secondary"
                >
                    {{ getDeviceTypeDisplayName(group.type) }}
                </h2>
                <div class="flex flex-col gap-3">
                    <div
                        v-for="device in group.devices"
                        :id="`ms-${device.uid}`"
                        :key="device.uid"
                        class="rounded-lg border bg-bg-two px-4 py-3 transition-colors"
                        :class="
                            highlightUID === device.uid
                                ? 'border-accent ring-2 ring-accent'
                                : 'border-border-one'
                        "
                    >
                        <div class="flex items-center gap-2">
                            <span
                                class="h-2.5 w-2.5 shrink-0 rounded-full"
                                :style="{ backgroundColor: deviceColor(device.uid) }"
                            />
                            <span class="truncate text-base font-medium text-text-color">
                                {{ deviceLabel(device.uid) }}
                            </span>
                            <span
                                v-if="
                                    getDeviceTypeDisplayName(device.type) !==
                                    deviceLabel(device.uid)
                                "
                                class="shrink-0 text-xs text-text-color-secondary"
                            >
                                {{ getDeviceTypeDisplayName(device.type) }}
                            </span>
                            <UiSwitch
                                class="ml-auto"
                                :model-value="isDeviceEnabled(device.uid)"
                                @update:model-value="
                                    (v: boolean) => setDeviceEnabled(device.uid, v)
                                "
                            />
                        </div>
                        <div
                            v-if="isDeviceEnabled(device.uid)"
                            class="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-border-one pt-3"
                        >
                            <button
                                v-for="tog in togglesFor(device)"
                                :key="tog.channelName"
                                type="button"
                                class="flex items-center gap-2 rounded text-left text-sm text-text-color outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                @click="toggleSensor(device.uid, tog.channelName)"
                            >
                                <svg-icon
                                    type="mdi"
                                    :path="
                                        isSensorEnabled(device.uid, tog.channelName)
                                            ? mdiCheckboxMarked
                                            : mdiCheckboxBlankOutline
                                    "
                                    :size="18"
                                    :class="
                                        isSensorEnabled(device.uid, tog.channelName)
                                            ? 'text-accent'
                                            : 'text-text-color-secondary'
                                    "
                                />
                                <span class="truncate">
                                    {{ sensorLabel(device.uid, tog.channelName) }}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <section v-if="disabledDevices.length > 0" class="pt-4">
                <h2
                    class="pb-2 text-sm font-medium uppercase tracking-wide text-text-color-secondary"
                >
                    {{ t('layout.shell.manageSensors.disabledDevices') }}
                </h2>
                <div class="flex flex-col gap-3">
                    <div
                        v-for="setting in disabledDevices"
                        :id="`ms-${setting.uid}`"
                        :key="`disabled-${setting.uid}`"
                        class="flex items-center gap-2 rounded-lg border bg-bg-two px-4 py-3 transition-colors"
                        :class="
                            highlightUID === setting.uid
                                ? 'border-accent ring-2 ring-accent'
                                : 'border-border-one'
                        "
                    >
                        <span class="truncate text-base font-medium text-text-color">
                            {{ deviceLabel(setting.uid) }}
                        </span>
                        <UiSwitch
                            class="ml-auto"
                            :model-value="isDeviceEnabled(setting.uid)"
                            @update:model-value="(v: boolean) => setDeviceEnabled(setting.uid, v)"
                        />
                    </div>
                </div>
            </section>
        </div>

        <div class="flex items-center gap-3 border-t border-border-one px-4 py-3">
            <span class="text-sm text-text-color-secondary">
                {{ t('layout.shell.manageSensors.pendingChanges', changeCount) }}
            </span>
            <div class="ml-auto flex gap-2">
                <UiButton variant="outline" @click="cancel">{{ t('common.cancel') }}</UiButton>
                <UiButton :disabled="changeCount === 0" @click="apply">
                    {{ t('layout.shell.manageSensors.applyRestart') }}
                </UiButton>
            </div>
        </div>
    </div>
</template>
