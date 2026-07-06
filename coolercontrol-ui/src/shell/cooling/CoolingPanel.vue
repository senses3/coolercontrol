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
    mdiChartMultiple,
    mdiDragVertical,
    mdiFunction,
    mdiPinOff,
    mdiPinOutline,
    mdiPlus,
} from '@mdi/js'
import { VueDraggable } from 'vue-draggable-plus'
import { storeToRefs } from 'pinia'
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChannelValues } from '@/stores/DeviceStore.ts'
import type { Color, UID } from '@/models/Device.ts'
import CCColorPicker from '@/components/CCColorPicker.vue'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { HealthEntityType } from '@/models/DeviceHealth.ts'
import { useLibraryWizards } from '@/composables/useLibraryWizards.ts'
import {
    coolingChannels,
    pinId,
    type CoolingChannel,
    type CoolingDeviceGroup,
} from '@/shell/cooling/channels.ts'
import {
    reorderSubset,
    setDeviceChildrenSubset,
    setGroupOrder,
    sortEntitiesByGroup,
} from '@/shell/panelOrder.ts'
import UiSeparator from '@/shell/ui/UiSeparator.vue'

const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const { currentDeviceStatus } = storeToRefs(deviceStore)

// Mutable copy so rows are drag-sortable; rebuilt when devices change.
const groups = ref<CoolingDeviceGroup[]>([])
watchEffect(() => {
    groups.value = coolingChannels(deviceStore.allDevices())
})

// All channel ids of a device in current order (fans are a subset of the
// device's shared order list, which also orders temps for Monitoring).
const allChannelIds = (deviceUID: UID): string[] => {
    const device = [...deviceStore.allDevices()].find((dev) => dev.uid === deviceUID)
    if (device?.info == null) return []
    const ids = [...device.info.temps.keys(), ...device.info.channels.keys()]
    return ids.map((name) => pinId(deviceUID, name))
}

const persistChannelOrder = (group: CoolingDeviceGroup): void => {
    settingsStore.menuOrder = setDeviceChildrenSubset(
        settingsStore.menuOrder,
        group.deviceUID,
        group.channels.map((channel) => pinId(channel.deviceUID, channel.channelName)),
        allChannelIds(group.deviceUID),
    )
    deviceStore.reSortDevicesByMenuOrder()
}

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

const pinnedChannels = ref<CoolingChannel[]>([])
watchEffect(() => {
    const channels = groups.value
        .flatMap((group) => group.channels)
        .filter((channel) => isPinned(channel))
    const order = settingsStore.pinnedIds
    channels.sort(
        (a, b) =>
            order.indexOf(pinId(a.deviceUID, a.channelName)) -
            order.indexOf(pinId(b.deviceUID, b.channelName)),
    )
    pinnedChannels.value = channels
})

const persistPinnedOrder = (): void => {
    settingsStore.pinnedIds = reorderSubset(
        settingsStore.pinnedIds,
        pinnedChannels.value.map((channel) => pinId(channel.deviceUID, channel.channelName)),
    )
}

const setChannelColor = (channel: CoolingChannel, newColor: Color): void => {
    const setting = settingsStore.allUIDeviceSettings
        .get(channel.deviceUID)
        ?.sensorsAndChannels.get(channel.channelName)
    if (setting != null) setting.userColor = newColor
}

const profileLinks = ref<typeof settingsStore.profiles>([])
watchEffect(() => {
    profileLinks.value = settingsStore.profiles.filter((profile) => profile.uid !== '0')
})
const persistProfileOrder = (): void => {
    settingsStore.menuOrder = setGroupOrder(
        settingsStore.menuOrder,
        'profiles',
        profileLinks.value.map((profile) => profile.uid),
    )
    sortEntitiesByGroup(settingsStore.menuOrder, 'profiles', settingsStore.profiles, (p) => p.uid)
}
const functionLinks = ref<typeof settingsStore.functions>([])
watchEffect(() => {
    functionLinks.value = settingsStore.functions.filter((fun) => fun.uid !== '0')
})
const persistFunctionOrder = (): void => {
    settingsStore.menuOrder = setGroupOrder(
        settingsStore.menuOrder,
        'functions',
        functionLinks.value.map((fun) => fun.uid),
    )
    sortEntitiesByGroup(settingsStore.menuOrder, 'functions', settingsStore.functions, (f) => f.uid)
}
const { openProfileWizard, openFunctionWizard } = useLibraryWizards()

// A profile is unhealthy when the daemon reports a missing or stale temp source for it.
const isProfileUnhealthy = (profileUID: string): boolean =>
    settingsStore.healthMissing.some(
        (ref) => ref.entity_type === HealthEntityType.Profile && ref.entity_uid === profileUID,
    ) ||
    settingsStore.healthStaleSource.some(
        (ref) => ref.entity_type === HealthEntityType.Profile && ref.entity_uid === profileUID,
    )
</script>

<template>
    <div class="flex flex-col gap-0.5 p-2 pb-24 text-base">
        <template v-if="pinnedChannels.length > 0">
            <div class="px-2 pb-1 text-xs uppercase text-text-color-secondary">
                {{ t('layout.shell.coolingPanel.pinned') }}
            </div>
            <VueDraggable
                v-model="pinnedChannels"
                handle=".drag-handle"
                :animation="150"
                class="flex flex-col gap-0.5"
                @end="persistPinnedOrder"
            >
                <div
                    v-for="channel in pinnedChannels"
                    :key="`pin-${channel.deviceUID}-${channel.channelName}`"
                    class="group flex items-center rounded-lg hover:bg-surface-hover focus-within:bg-surface-hover focus-within:ring-2 focus-within:ring-accent"
                >
                    <RouterLink
                        :to="{
                            name: 'cooling-channel',
                            params: {
                                deviceUID: channel.deviceUID,
                                channelName: channel.channelName,
                            },
                        }"
                        class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none"
                        exact-active-class="!text-accent"
                    >
                        <span
                            class="h-2 w-2 shrink-0 rounded-full"
                            :style="{
                                backgroundColor: channelColor(
                                    channel.deviceUID,
                                    channel.channelName,
                                ),
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
                        <span class="drag-handle cursor-grab p-1 text-text-color-secondary">
                            <svg-icon type="mdi" :path="mdiDragVertical" :size="16" />
                        </span>
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
            </VueDraggable>
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
            <VueDraggable
                v-model="group.channels"
                handle=".drag-handle"
                :animation="150"
                class="flex flex-col gap-0.5"
                @end="persistChannelOrder(group)"
            >
                <div
                    v-for="channel in group.channels"
                    :key="channel.channelName"
                    class="group flex items-center rounded-lg hover:bg-surface-hover focus-within:bg-surface-hover focus-within:ring-2 focus-within:ring-accent"
                >
                    <RouterLink
                        :to="{
                            name: 'cooling-channel',
                            params: {
                                deviceUID: channel.deviceUID,
                                channelName: channel.channelName,
                            },
                        }"
                        class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none"
                        exact-active-class="!text-accent"
                    >
                        <span
                            class="h-2 w-2 shrink-0 rounded-full"
                            :style="{
                                backgroundColor: channelColor(
                                    channel.deviceUID,
                                    channel.channelName,
                                ),
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
                        <span class="drag-handle cursor-grab p-1 text-text-color-secondary">
                            <svg-icon type="mdi" :path="mdiDragVertical" :size="16" />
                        </span>
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
            </VueDraggable>
        </template>

        <UiSeparator class="my-1" />
        <div class="truncate px-2 pb-1 pt-3 text-xs uppercase text-text-color-secondary">
            {{ t('layout.shell.coolingPanel.library') }}
        </div>
        <div class="flex items-center justify-between px-3 pb-1 pt-1">
            <span class="text-xs uppercase text-text-color-secondary opacity-70">
                {{ t('layout.shell.coolingPanel.profiles') }}
            </span>
            <button
                type="button"
                class="rounded p-0.5 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                :title="t('layout.menu.tooltips.addProfile')"
                @click="openProfileWizard"
            >
                <svg-icon type="mdi" :path="mdiPlus" :size="16" />
            </button>
        </div>
        <VueDraggable
            v-model="profileLinks"
            handle=".drag-handle"
            :animation="150"
            class="flex flex-col gap-0.5"
            @end="persistProfileOrder"
        >
            <RouterLink
                v-for="profile in profileLinks"
                :key="profile.uid"
                :to="{ name: 'profiles', params: { profileUID: profile.uid } }"
                class="group flex items-center gap-2 rounded-lg px-3 py-1 text-text-color outline-none hover:bg-surface-hover focus:ring-2 focus:ring-accent"
                exact-active-class="bg-surface-hover !text-accent"
            >
                <svg-icon
                    type="mdi"
                    :path="mdiChartMultiple"
                    :size="14"
                    class="shrink-0 text-text-color-secondary"
                />
                <span class="truncate">{{ profile.name }}</span>
                <svg-icon
                    v-if="isProfileUnhealthy(profile.uid)"
                    type="mdi"
                    :path="mdiAlert"
                    :size="14"
                    class="shrink-0 text-warning"
                />
                <span
                    class="drag-handle ml-auto hidden cursor-grab p-0.5 text-text-color-secondary group-hover:inline-flex"
                >
                    <svg-icon type="mdi" :path="mdiDragVertical" :size="14" />
                </span>
            </RouterLink>
        </VueDraggable>
        <div class="flex items-center justify-between px-3 pb-1 pt-2">
            <span class="text-xs uppercase text-text-color-secondary opacity-70">
                {{ t('layout.shell.coolingPanel.functions') }}
            </span>
            <button
                type="button"
                class="rounded p-0.5 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                :title="t('layout.menu.tooltips.addFunction')"
                @click="openFunctionWizard"
            >
                <svg-icon type="mdi" :path="mdiPlus" :size="16" />
            </button>
        </div>
        <VueDraggable
            v-model="functionLinks"
            handle=".drag-handle"
            :animation="150"
            class="flex flex-col gap-0.5"
            @end="persistFunctionOrder"
        >
            <RouterLink
                v-for="fun in functionLinks"
                :key="fun.uid"
                :to="{ name: 'functions', params: { functionUID: fun.uid } }"
                class="group flex items-center gap-2 rounded-lg px-3 py-1 text-text-color outline-none hover:bg-surface-hover focus:ring-2 focus:ring-accent"
                exact-active-class="bg-surface-hover !text-accent"
            >
                <svg-icon
                    type="mdi"
                    :path="mdiFunction"
                    :size="14"
                    class="shrink-0 text-text-color-secondary"
                />
                <span class="truncate">{{ fun.name }}</span>
                <span
                    class="drag-handle ml-auto hidden cursor-grab p-0.5 text-text-color-secondary group-hover:inline-flex"
                >
                    <svg-icon type="mdi" :path="mdiDragVertical" :size="14" />
                </span>
            </RouterLink>
        </VueDraggable>
    </div>
</template>
