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
import { mdiDnsOutline, mdiMonitor, mdiPaletteOutline, mdiTuneVariant } from '@mdi/js'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'

const { t } = useI18n()
const route = useRoute()
const deviceStore = useDeviceStore()

// Anchor params match AppSettings' card group ids (single scrolling page).
const tabs = computed(() => {
    const entries = [
        { tab: 'general', labelKey: 'layout.settings.general', icon: mdiTuneVariant },
        { tab: 'appearance', labelKey: 'layout.settings.appearance', icon: mdiPaletteOutline },
        { tab: 'daemon', labelKey: 'views.daemon.title', icon: mdiDnsOutline },
    ]
    if (deviceStore.isQtApp()) {
        entries.push({ tab: 'desktop', labelKey: 'layout.settings.desktop', icon: mdiMonitor })
    }
    return entries
})

// Legacy numeric params still arrive from old links (startup page etc.).
const NUMERIC_ALIASES: Record<string, string> = { '0': 'general', '1': 'daemon', '2': 'desktop' }
const isActive = (tab: string): boolean => {
    if (route.name !== 'settings') return false
    const param = (route.params.tabNumber as string) ?? 'general'
    return (NUMERIC_ALIASES[param] ?? param) === tab
}
</script>

<template>
    <div class="flex flex-col gap-0.5 p-2 pb-24 text-base">
        <RouterLink
            v-for="entry in tabs"
            :key="entry.tab"
            :to="{ name: 'settings', params: { tabNumber: entry.tab } }"
            class="flex items-center gap-2 rounded-lg px-2 py-1.5 outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
            :class="isActive(entry.tab) ? 'bg-surface-hover text-accent' : 'text-text-color'"
        >
            <svg-icon
                type="mdi"
                :path="entry.icon"
                :size="14"
                class="shrink-0 text-text-color-secondary"
            />
            {{ t(entry.labelKey) }}
        </RouterLink>
    </div>
</template>
