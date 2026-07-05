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
import { mdiAlert, mdiBookmarkMultipleOutline, mdiPin, mdiPinOutline } from '@mdi/js'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UID } from '@/models/Device.ts'
import type { Color } from '@/models/Device.ts'
import CCColorPicker from '@/components/CCColorPicker.vue'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { coolingChannels, pinId, type CoolingChannel } from '@/shell/cooling/channels.ts'
import UiCollapsible from '@/shell/ui/UiCollapsible.vue'
import UiSeparator from '@/shell/ui/UiSeparator.vue'

const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const { currentDeviceStatus } = storeToRefs(deviceStore)

const groups = computed(() => coolingChannels(deviceStore.allDevices()))

const deviceLabel = (deviceUID: UID): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.name ?? deviceUID

const channelLabel = (deviceUID: UID, channelName: string): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.sensorsAndChannels.get(channelName)?.name ??
    channelName

const channelColor = (deviceUID: UID, channelName: string): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.sensorsAndChannels.get(channelName)?.color ??
    ''

const liveValue = (deviceUID: UID, channelName: string): string => {
    const values = currentDeviceStatus.value.get(deviceUID)?.get(channelName)
    if (values == null) return ''
    const parts: string[] = []
    if (values.duty != null) parts.push(`${values.duty}%`)
    if (values.rpm != null) parts.push(`${values.rpm} rpm`)
    return parts.join(' ')
}

const isUnhealthy = (deviceUID: UID, channelName: string): boolean =>
    settingsStore.healthFailsafe.some(
        (ref) => ref.device_uid === deviceUID && ref.name === channelName,
    )

const isPinned = (channel: CoolingChannel): boolean =>
    settingsStore.pinnedIds.includes(pinId(channel.deviceUID, channel.channelName))

const togglePin = (channel: CoolingChannel): void => {
    const id = pinId(channel.deviceUID, channel.channelName)
    settingsStore.pinnedIds = settingsStore.pinnedIds.includes(id)
        ? settingsStore.pinnedIds.filter((pinned) => pinned !== id)
        : [...settingsStore.pinnedIds, id]
}

const pinnedChannels = computed<CoolingChannel[]>(() =>
    groups.value.flatMap((group) => group.channels).filter((channel) => isPinned(channel)),
)

const setChannelColor = (channel: CoolingChannel, newColor: Color): void => {
    const setting = settingsStore.allUIDeviceSettings
        .get(channel.deviceUID)
        ?.sensorsAndChannels.get(channel.channelName)
    if (setting != null) setting.userColor = newColor
}

const activeModeName = computed<string | undefined>(
    () => settingsStore.modes.find((mode) => mode.uid === settingsStore.modeActiveCurrent)?.name,
)

const profileLinks = computed(() => settingsStore.profiles.filter((profile) => profile.uid !== '0'))
const functionLinks = computed(() => settingsStore.functions.filter((fun) => fun.uid !== '0'))
</script>

<template>
    <div class="flex flex-col gap-0.5 p-2 text-sm">
        <template v-if="pinnedChannels.length > 0">
            <div class="px-2 pb-1 text-xs uppercase text-text-color-secondary">
                {{ t('layout.shell.coolingPanel.pinned') }}
            </div>
            <RouterLink
                v-for="channel in pinnedChannels"
                :key="`pin-${channel.deviceUID}-${channel.channelName}`"
                :to="{
                    name: 'cooling-channel',
                    params: { deviceUID: channel.deviceUID, channelName: channel.channelName },
                }"
                class="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
            >
                <span
                    class="h-2 w-2 shrink-0 rounded-full"
                    :style="{
                        backgroundColor: channelColor(channel.deviceUID, channel.channelName),
                    }"
                />
                <span class="truncate">
                    {{ channelLabel(channel.deviceUID, channel.channelName) }}
                </span>
                <span class="truncate text-xs text-text-color-secondary">
                    {{ deviceLabel(channel.deviceUID) }}
                </span>
                <span class="ml-auto whitespace-nowrap text-xs text-text-color-secondary">
                    {{ liveValue(channel.deviceUID, channel.channelName) }}
                </span>
            </RouterLink>
            <UiSeparator class="my-1" />
        </template>

        <template v-for="group in groups" :key="group.deviceUID">
            <div class="truncate px-2 pb-1 pt-2 text-xs uppercase text-text-color-secondary">
                {{ deviceLabel(group.deviceUID) }}
            </div>
            <div
                v-for="channel in group.channels"
                :key="channel.channelName"
                class="group flex items-center rounded-lg hover:bg-surface-hover"
            >
                <RouterLink
                    :to="{
                        name: 'cooling-channel',
                        params: { deviceUID: channel.deviceUID, channelName: channel.channelName },
                    }"
                    class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                    <span
                        class="h-2 w-2 shrink-0 rounded-full"
                        :style="{
                            backgroundColor: channelColor(channel.deviceUID, channel.channelName),
                        }"
                    />
                    <span class="truncate">
                        {{ channelLabel(channel.deviceUID, channel.channelName) }}
                    </span>
                    <svg-icon
                        v-if="isUnhealthy(channel.deviceUID, channel.channelName)"
                        type="mdi"
                        :path="mdiAlert"
                        :size="14"
                        class="shrink-0 text-warning"
                    />
                    <span class="ml-auto whitespace-nowrap text-xs text-text-color-secondary">
                        {{ liveValue(channel.deviceUID, channel.channelName) }}
                    </span>
                </RouterLink>
                <div class="hidden items-center gap-0.5 pr-1 group-hover:flex">
                    <CCColorPicker
                        :model-value="channelColor(channel.deviceUID, channel.channelName)"
                        :size="0.9"
                        @update:model-value="(c: Color) => setChannelColor(channel, c)"
                    />
                    <button
                        type="button"
                        class="rounded p-1 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                        :title="
                            isPinned(channel)
                                ? t('layout.shell.coolingPanel.unpin')
                                : t('layout.shell.coolingPanel.pin')
                        "
                        @click.prevent="togglePin(channel)"
                    >
                        <svg-icon
                            type="mdi"
                            :path="isPinned(channel) ? mdiPin : mdiPinOutline"
                            :size="14"
                        />
                    </button>
                </div>
            </div>
        </template>

        <UiSeparator class="my-1" />
        <RouterLink
            :to="{ name: 'cooling-modes' }"
            class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
        >
            <svg-icon type="mdi" :path="mdiBookmarkMultipleOutline" :size="16" />
            <span>{{ t('layout.shell.modes') }}</span>
            <span v-if="activeModeName" class="ml-auto truncate text-xs text-text-color-secondary">
                {{ activeModeName }}
            </span>
        </RouterLink>

        <UiCollapsible :title="t('layout.shell.coolingPanel.library')">
            <div class="px-2 pb-1 pt-1 text-xs uppercase text-text-color-secondary">
                {{ t('layout.shell.coolingPanel.profiles') }}
            </div>
            <RouterLink
                v-for="profile in profileLinks"
                :key="profile.uid"
                :to="{ name: 'profiles', params: { profileUID: profile.uid } }"
                class="block truncate rounded-lg px-4 py-1 text-text-color outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
            >
                {{ profile.name }}
            </RouterLink>
            <div class="px-2 pb-1 pt-2 text-xs uppercase text-text-color-secondary">
                {{ t('layout.shell.coolingPanel.functions') }}
            </div>
            <RouterLink
                v-for="fun in functionLinks"
                :key="fun.uid"
                :to="{ name: 'functions', params: { functionUID: fun.uid } }"
                class="block truncate rounded-lg px-4 py-1 text-text-color outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
            >
                {{ fun.name }}
            </RouterLink>
        </UiCollapsible>
    </div>
</template>
