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
import { mdiAlert, mdiChartMultiple, mdiFunction, mdiPinOff, mdiPinOutline } from '@mdi/js'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChannelValues } from '@/stores/DeviceStore.ts'
import type { Color, UID } from '@/models/Device.ts'
import CCColorPicker from '@/components/CCColorPicker.vue'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { coolingChannels, pinId, type CoolingChannel } from '@/shell/cooling/channels.ts'
import UiSeparator from '@/shell/ui/UiSeparator.vue'

const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const { currentDeviceStatus } = storeToRefs(deviceStore)

const groups = computed(() => coolingChannels(deviceStore.allDevices()))

const deviceLabel = (deviceUID: UID): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.name ?? deviceUID

const deviceColor = (deviceUID: UID): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.userColor ?? ''

const channelLabel = (deviceUID: UID, channelName: string): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.sensorsAndChannels.get(channelName)?.name ??
    channelName

const channelColor = (deviceUID: UID, channelName: string): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.sensorsAndChannels.get(channelName)?.color ??
    ''

const liveFor = (deviceUID: UID, channelName: string): ChannelValues | undefined =>
    currentDeviceStatus.value.get(deviceUID)?.get(channelName)

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

const profileLinks = computed(() => settingsStore.profiles.filter((profile) => profile.uid !== '0'))
const functionLinks = computed(() => settingsStore.functions.filter((fun) => fun.uid !== '0'))
</script>

<template>
    <div class="flex flex-col gap-0.5 p-2 pb-24 text-base">
        <template v-if="pinnedChannels.length > 0">
            <div class="px-2 pb-1 text-xs uppercase text-text-color-secondary">
                {{ t('layout.shell.coolingPanel.pinned') }}
            </div>
            <div
                v-for="channel in pinnedChannels"
                :key="`pin-${channel.deviceUID}-${channel.channelName}`"
                class="group flex items-center rounded-lg hover:bg-surface-hover focus-within:bg-surface-hover focus-within:ring-2 focus-within:ring-accent"
            >
                <RouterLink
                    :to="{
                        name: 'cooling-channel',
                        params: { deviceUID: channel.deviceUID, channelName: channel.channelName },
                    }"
                    class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none"
                    exact-active-class="!text-accent"
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
                    <svg-icon
                        v-if="isUnhealthy(channel.deviceUID, channel.channelName)"
                        type="mdi"
                        :path="mdiAlert"
                        :size="14"
                        class="shrink-0 text-warning"
                    />
                    <span
                        class="ml-auto flex items-baseline gap-1.5 whitespace-nowrap group-hover:hidden group-focus-within:hidden"
                    >
                        <span
                            v-if="liveFor(channel.deviceUID, channel.channelName)?.duty != null"
                            class="tabular-nums text-text-color"
                        >
                            {{ liveFor(channel.deviceUID, channel.channelName)?.duty }}%
                        </span>
                        <span
                            v-if="liveFor(channel.deviceUID, channel.channelName)?.rpm != null"
                            class="text-sm tabular-nums text-text-color-secondary"
                        >
                            {{ liveFor(channel.deviceUID, channel.channelName)?.rpm }} rpm
                        </span>
                    </span>
                </RouterLink>
                <div
                    class="ml-auto hidden items-center gap-0.5 pr-1 group-hover:flex group-focus-within:flex"
                >
                    <CCColorPicker
                        :model-value="channelColor(channel.deviceUID, channel.channelName)"
                        :size="1.25"
                        @update:model-value="(c: Color) => setChannelColor(channel, c)"
                    />
                    <button
                        type="button"
                        class="rounded p-1 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                        :title="t('layout.shell.coolingPanel.unpin')"
                        @click.prevent="togglePin(channel)"
                    >
                        <svg-icon type="mdi" :path="mdiPinOff" :size="16" />
                    </button>
                </div>
            </div>
            <UiSeparator class="my-1" />
        </template>

        <template v-for="group in groups" :key="group.deviceUID">
            <div
                class="truncate px-2 pb-1 pt-2 text-xs uppercase"
                :class="{ 'text-text-color-secondary': !deviceColor(group.deviceUID) }"
                :style="deviceColor(group.deviceUID) ? { color: deviceColor(group.deviceUID) } : {}"
            >
                {{ deviceLabel(group.deviceUID) }}
            </div>
            <div
                v-for="channel in group.channels"
                :key="channel.channelName"
                class="group flex items-center rounded-lg hover:bg-surface-hover focus-within:bg-surface-hover focus-within:ring-2 focus-within:ring-accent"
            >
                <RouterLink
                    :to="{
                        name: 'cooling-channel',
                        params: { deviceUID: channel.deviceUID, channelName: channel.channelName },
                    }"
                    class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none"
                    exact-active-class="!text-accent"
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
                    <span
                        class="ml-auto flex items-baseline gap-1.5 whitespace-nowrap group-hover:hidden group-focus-within:hidden"
                    >
                        <span
                            v-if="liveFor(channel.deviceUID, channel.channelName)?.duty != null"
                            class="tabular-nums text-text-color"
                        >
                            {{ liveFor(channel.deviceUID, channel.channelName)?.duty }}%
                        </span>
                        <span
                            v-if="liveFor(channel.deviceUID, channel.channelName)?.rpm != null"
                            class="text-sm tabular-nums text-text-color-secondary"
                        >
                            {{ liveFor(channel.deviceUID, channel.channelName)?.rpm }} rpm
                        </span>
                    </span>
                </RouterLink>
                <div
                    class="ml-auto hidden items-center gap-0.5 pr-1 group-hover:flex group-focus-within:flex"
                >
                    <CCColorPicker
                        :model-value="channelColor(channel.deviceUID, channel.channelName)"
                        :size="1.25"
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
                            :path="isPinned(channel) ? mdiPinOff : mdiPinOutline"
                            :size="16"
                        />
                    </button>
                </div>
            </div>
        </template>

        <UiSeparator class="my-1" />
        <div class="truncate px-2 pb-1 pt-3 text-xs uppercase text-text-color-secondary">
            {{ t('layout.shell.coolingPanel.library') }}
        </div>
        <div
            class="flex items-center gap-1.5 px-3 pb-1 pt-1 text-xs uppercase text-text-color-secondary opacity-70"
        >
            <svg-icon type="mdi" :path="mdiChartMultiple" :size="14" />
            {{ t('layout.shell.coolingPanel.profiles') }}
        </div>
        <RouterLink
            v-for="profile in profileLinks"
            :key="profile.uid"
            :to="{ name: 'profiles', params: { profileUID: profile.uid } }"
            class="block truncate rounded-lg px-4 py-1 text-text-color outline-none hover:bg-surface-hover focus:ring-2 focus:ring-accent"
            exact-active-class="bg-surface-hover !text-accent"
        >
            {{ profile.name }}
        </RouterLink>
        <div
            class="flex items-center gap-1.5 px-3 pb-1 pt-2 text-xs uppercase text-text-color-secondary opacity-70"
        >
            <svg-icon type="mdi" :path="mdiFunction" :size="14" />
            {{ t('layout.shell.coolingPanel.functions') }}
        </div>
        <RouterLink
            v-for="fun in functionLinks"
            :key="fun.uid"
            :to="{ name: 'functions', params: { functionUID: fun.uid } }"
            class="block truncate rounded-lg px-4 py-1 text-text-color outline-none hover:bg-surface-hover focus:ring-2 focus:ring-accent"
            exact-active-class="bg-surface-hover !text-accent"
        >
            {{ fun.name }}
        </RouterLink>
    </div>
</template>
