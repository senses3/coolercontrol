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
import { mdiCog, mdiLockOutline, mdiPower } from '@mdi/js'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { PLUGINS_SECTION, SHELL_SECTIONS, type SectionId } from '@/shell/sections.ts'
import UiDropdownMenu from '@/shell/ui/UiDropdownMenu.vue'
import ShellAccessMenuItems from '@/shell/ShellAccessMenuItems.vue'
import ShellPowerMenuItems from '@/shell/ShellPowerMenuItems.vue'

const route = useRoute()
const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()

// Settings is docked at the rail bottom (below), so it is dropped from the top list.
// Plugins is always shown so its overview (a getting-started page) stays discoverable
// even before any plugin is installed.
const railSections = computed(() => {
    const sections = SHELL_SECTIONS.filter((section) => section.id !== 'settings')
    return [...sections, PLUGINS_SECTION]
})
const activeSection = computed(() => route.meta.section as SectionId | undefined)
const logoUrl = computed(() => (settingsStore.eyeCandy ? '/logo-animated.svg' : '/logo.svg'))
</script>

<template>
    <nav class="flex h-full w-20 flex-col items-center gap-1 py-2">
        <RouterLink
            id="logo"
            :to="{ name: 'startup-page' }"
            class="rounded-lg p-1 outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
        >
            <img :src="logoUrl" alt="CoolerControl" class="h-10 w-10" />
        </RouterLink>
        <RouterLink
            v-for="section in railSections"
            :id="`rail-${section.id}`"
            :key="section.id"
            :to="{ name: section.routeName }"
            class="flex w-[4.5rem] flex-col items-center gap-0.5 rounded-lg px-1 py-2 outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
            :class="
                activeSection === section.id
                    ? 'text-accent'
                    : 'text-text-color-secondary hover:text-text-color'
            "
        >
            <svg-icon type="mdi" :path="section.icon" :size="deviceStore.getREMSize(1.5)" />
            <span class="text-[0.8125rem] leading-tight">{{ t(section.labelKey) }}</span>
        </RouterLink>
        <div class="flex-1" />
        <RouterLink
            id="rail-settings"
            :to="{ name: 'settings' }"
            class="flex w-[4.5rem] flex-col items-center gap-0.5 rounded-lg px-1 py-2 outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
            :class="
                activeSection === 'settings'
                    ? 'text-accent'
                    : 'text-text-color-secondary hover:text-text-color'
            "
        >
            <svg-icon type="mdi" :path="mdiCog" :size="deviceStore.getREMSize(1.5)" />
            <span class="text-[0.8125rem] leading-tight">{{ t('layout.shell.settings') }}</span>
        </RouterLink>
        <UiDropdownMenu>
            <template #trigger>
                <button
                    id="access"
                    type="button"
                    class="flex w-[4.5rem] flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-text-color-secondary outline-none hover:bg-surface-hover hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                >
                    <svg-icon
                        type="mdi"
                        :path="mdiLockOutline"
                        :size="deviceStore.getREMSize(1.5)"
                    />
                    <span class="text-[0.8125rem] leading-tight">
                        {{ t('layout.shell.access') }}
                    </span>
                </button>
            </template>
            <ShellAccessMenuItems />
        </UiDropdownMenu>
        <UiDropdownMenu>
            <template #trigger>
                <button
                    id="restart"
                    type="button"
                    class="flex w-[4.5rem] flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-text-color-secondary outline-none hover:bg-surface-hover hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                >
                    <svg-icon type="mdi" :path="mdiPower" :size="deviceStore.getREMSize(1.5)" />
                    <span class="text-[0.8125rem] leading-tight">
                        {{ t('layout.shell.power') }}
                    </span>
                </button>
            </template>
            <ShellPowerMenuItems />
        </UiDropdownMenu>
    </nav>
</template>
