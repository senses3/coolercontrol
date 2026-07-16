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
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { SHELL_SECTIONS, type SectionId } from '@/shell/sections.ts'

const route = useRoute()
const { t } = useI18n()
const deviceStore = useDeviceStore()
const activeSection = computed(() => route.meta.section as SectionId | undefined)
</script>

<template>
    <nav
        id="shell-bottom-nav"
        class="flex h-14 shrink-0 items-stretch justify-around border-t border-border-one"
    >
        <RouterLink
            v-for="section in SHELL_SECTIONS"
            :key="section.id"
            :to="{ name: section.routeName }"
            class="flex min-w-14 flex-col items-center justify-center gap-0.5 px-1 outline-none"
            :class="activeSection === section.id ? 'text-accent' : 'text-text-color-secondary'"
        >
            <svg-icon type="mdi" :path="section.icon" :size="deviceStore.getREMSize(1.4)" />
            <span class="text-[0.8125rem] leading-tight">{{ t(section.labelKey) }}</span>
        </RouterLink>
    </nav>
</template>
