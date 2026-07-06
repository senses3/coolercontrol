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
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { sectionById, type SectionId } from '@/shell/sections.ts'
import CoolingPanel from '@/shell/cooling/CoolingPanel.vue'
import HomePanel from '@/shell/home/HomePanel.vue'
import MonitoringPanel from '@/shell/monitoring/MonitoringPanel.vue'
import DevicesPanel from '@/shell/devices/DevicesPanel.vue'
import PluginsPanel from '@/shell/plugins/PluginsPanel.vue'
import UiScrollArea from '@/shell/ui/UiScrollArea.vue'
import UiSeparator from '@/shell/ui/UiSeparator.vue'

const route = useRoute()
const { t } = useI18n()
const section = computed(() => {
    const id = route.meta.section as SectionId | undefined
    return id != null ? sectionById(id) : undefined
})
</script>

<template>
    <div class="flex h-full flex-col">
        <template v-if="section != null">
            <div class="px-3 py-2 text-lg font-medium text-text-color">
                {{ t(section.labelKey) }}
            </div>
            <UiSeparator />
            <UiScrollArea>
                <HomePanel v-if="section.id === 'home'" />
                <CoolingPanel v-else-if="section.id === 'cooling'" />
                <MonitoringPanel v-else-if="section.id === 'monitoring'" />
                <DevicesPanel v-else-if="section.id === 'devices'" />
                <PluginsPanel v-else-if="section.id === 'plugins'" />
                <div v-else />
            </UiScrollArea>
        </template>
    </div>
</template>
