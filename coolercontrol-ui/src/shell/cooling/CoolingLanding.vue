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
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UID } from '@/models/Device.ts'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { coolingChannels } from '@/shell/cooling/channels.ts'
import { useToolWizards } from '@/composables/useToolWizards.ts'
import { features } from '@/features'
import ChannelCard from '@/shell/cooling/ChannelCard.vue'
import UiButton from '@/shell/ui/UiButton.vue'

const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()

const groups = computed(() => coolingChannels(deviceStore.allDevices()))

const deviceLabel = (deviceUID: UID): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.name ?? deviceUID

const deviceColor = (deviceUID: UID): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.userColor ?? ''

const { openCalibrationWizard, openGenerateWizard } = useToolWizards()
</script>

<template>
    <div class="flex h-full flex-col overflow-y-auto">
        <div class="flex flex-wrap items-center gap-3 px-4 pt-4">
            <h1 class="text-xl font-semibold text-text-color">{{ t('layout.shell.cooling') }}</h1>
            <span class="text-base text-text-color-secondary">
                {{ t('layout.shell.coolingPage.landingHint') }}
            </span>
            <span class="ml-auto flex items-center gap-2">
                <UiButton
                    v-if="features.coolingWizard"
                    size="sm"
                    variant="outline"
                    @click="openGenerateWizard()"
                >
                    {{ t('views.appInfo.gettingStartedAutoCreateLink') }}
                </UiButton>
                <UiButton size="sm" variant="outline" @click="openCalibrationWizard()">
                    {{ t('components.wizards.calibration.title') }}
                </UiButton>
            </span>
        </div>
        <template v-if="groups.length > 0">
            <section v-for="group in groups" :key="group.deviceUID" class="px-4 pt-4">
                <h2
                    class="truncate pb-2 text-sm font-medium uppercase tracking-wide"
                    :class="{ 'text-text-color-secondary': !deviceColor(group.deviceUID) }"
                    :style="
                        deviceColor(group.deviceUID) ? { color: deviceColor(group.deviceUID) } : {}
                    "
                >
                    {{ deviceLabel(group.deviceUID) }}
                </h2>
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    <ChannelCard
                        v-for="channel in group.channels"
                        :key="`${channel.deviceUID}-${channel.channelName}`"
                        :channel="channel"
                    />
                </div>
            </section>
            <div class="pb-6" />
        </template>
        <div v-else class="flex flex-1 items-center justify-center text-text-color-secondary">
            {{ t('layout.shell.coolingPage.noChannels') }}
        </div>
    </div>
</template>
