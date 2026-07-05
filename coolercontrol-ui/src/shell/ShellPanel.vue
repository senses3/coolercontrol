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
                <CoolingPanel v-if="section.id === 'cooling'" />
                <div v-else class="p-3 text-sm text-text-color-secondary">
                    {{ t('layout.shell.panelPlaceholder', { phase: section.phase }) }}
                </div>
            </UiScrollArea>
        </template>
    </div>
</template>
