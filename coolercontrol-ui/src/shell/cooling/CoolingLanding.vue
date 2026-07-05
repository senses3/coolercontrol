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
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { coolingChannels } from '@/shell/cooling/channels.ts'
import ChannelCard from '@/shell/cooling/ChannelCard.vue'

const { t } = useI18n()
const deviceStore = useDeviceStore()

const channels = computed(() =>
    coolingChannels(deviceStore.allDevices()).flatMap((group) => group.channels),
)
</script>

<template>
    <div class="flex h-full flex-col overflow-y-auto">
        <div class="flex items-center gap-3 px-4 pt-4">
            <h1 class="text-xl font-semibold text-text-color">{{ t('layout.shell.cooling') }}</h1>
            <span class="text-sm text-text-color-secondary">
                {{ t('layout.shell.coolingPage.landingHint') }}
            </span>
        </div>
        <div
            v-if="channels.length > 0"
            class="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        >
            <ChannelCard
                v-for="channel in channels"
                :key="`${channel.deviceUID}-${channel.channelName}`"
                :channel="channel"
            />
        </div>
        <div v-else class="flex flex-1 items-center justify-center text-text-color-secondary">
            {{ t('layout.shell.coolingPage.noChannels') }}
        </div>
    </div>
</template>
