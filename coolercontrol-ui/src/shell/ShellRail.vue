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
import { mdiLockOutline, mdiPower } from '@mdi/js'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { PLUGINS_SECTION, SHELL_SECTIONS, type SectionId } from '@/shell/sections.ts'
import UiButton from '@/shell/ui/UiButton.vue'
import UiTooltip from '@/shell/ui/UiTooltip.vue'

const route = useRoute()
const { t } = useI18n()
const deviceStore = useDeviceStore()

const railSections = computed(() =>
    deviceStore.plugins.length > 0 ? [...SHELL_SECTIONS, PLUGINS_SECTION] : SHELL_SECTIONS,
)
const activeSection = computed(() => route.meta.section as SectionId | undefined)
</script>

<template>
    <nav class="flex h-full w-[4.5rem] flex-col items-center gap-1 py-2">
        <RouterLink
            v-for="section in railSections"
            :key="section.id"
            :to="{ name: section.routeName }"
            class="flex w-16 flex-col items-center gap-0.5 rounded-lg px-1 py-2 outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
            :class="
                activeSection === section.id
                    ? 'text-accent'
                    : 'text-text-color-secondary hover:text-text-color'
            "
        >
            <svg-icon type="mdi" :path="section.icon" :size="deviceStore.getREMSize(1.5)" />
            <span class="text-[0.65rem] leading-tight">{{ t(section.labelKey) }}</span>
        </RouterLink>
        <div class="flex-1" />
        <UiTooltip :text="t('layout.shell.laterPhase')" side="right">
            <span>
                <UiButton variant="ghost" size="icon" disabled>
                    <svg-icon
                        type="mdi"
                        :path="mdiLockOutline"
                        :size="deviceStore.getREMSize(1.25)"
                    />
                </UiButton>
            </span>
        </UiTooltip>
        <UiTooltip :text="t('layout.shell.laterPhase')" side="right">
            <span>
                <UiButton variant="ghost" size="icon" disabled>
                    <svg-icon type="mdi" :path="mdiPower" :size="deviceStore.getREMSize(1.25)" />
                </UiButton>
            </span>
        </UiTooltip>
    </nav>
</template>
