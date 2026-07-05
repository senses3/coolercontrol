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
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { sectionById, type SectionId } from '@/shell/sections.ts'

const props = defineProps<{ sectionId: SectionId }>()
const { t } = useI18n()
const section = computed(() => sectionById(props.sectionId)!)
</script>

<template>
    <div class="flex h-full flex-col items-center justify-center gap-3 text-text-color-secondary">
        <svg-icon type="mdi" :path="section.icon" :size="48" />
        <div class="text-xl text-text-color">{{ t(section.labelKey) }}</div>
        <div class="text-sm">
            {{ t('layout.shell.sectionPlaceholder', { phase: section.phase }) }}
        </div>
    </div>
</template>
