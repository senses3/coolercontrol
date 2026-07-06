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
import { mdiPowerPlugOutline, mdiViewListOutline } from '@mdi/js'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'

const { t } = useI18n()
const deviceStore = useDeviceStore()

interface PluginRow {
    id: string
    hasUi: boolean
    disabled: boolean
}

const pluginRows = computed((): PluginRow[] =>
    deviceStore.plugins.map((plugin) => ({
        id: plugin.id,
        hasUi: deviceStore.pluginUiInfo.get(plugin.id)?.has_ui === true,
        disabled: plugin.disabled === true,
    })),
)
</script>

<template>
    <div class="flex flex-col gap-0.5 p-2 pb-24 text-base">
        <RouterLink
            :to="{ name: 'plugins-overview' }"
            class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none hover:bg-surface-hover focus:ring-2 focus:ring-accent"
            exact-active-class="bg-surface-hover !text-accent"
        >
            <svg-icon
                type="mdi"
                :path="mdiViewListOutline"
                :size="14"
                class="shrink-0 text-text-color-secondary"
            />
            {{ t('layout.plugins.overview') }}
        </RouterLink>

        <template v-for="plugin in pluginRows" :key="plugin.id">
            <RouterLink
                v-if="plugin.hasUi && !plugin.disabled"
                :to="{ name: 'plugin-page', params: { pluginId: plugin.id } }"
                class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-text-color outline-none hover:bg-surface-hover focus:ring-2 focus:ring-accent"
                exact-active-class="bg-surface-hover !text-accent"
            >
                <svg-icon
                    type="mdi"
                    :path="mdiPowerPlugOutline"
                    :size="14"
                    class="shrink-0 text-text-color-secondary"
                />
                <span class="truncate">{{ plugin.id }}</span>
            </RouterLink>
            <div
                v-else
                class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-text-color-secondary"
                :class="{ 'opacity-60': plugin.disabled }"
            >
                <svg-icon type="mdi" :path="mdiPowerPlugOutline" :size="14" class="shrink-0" />
                <span class="truncate">{{ plugin.id }}</span>
                <span v-if="plugin.disabled" class="ml-auto text-xs">
                    {{ t('models.pluginStatus.disabled') }}
                </span>
            </div>
        </template>
    </div>
</template>
