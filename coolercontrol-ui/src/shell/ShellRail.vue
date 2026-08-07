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
import {
    PLUGINS_SECTION,
    SHELL_SECTIONS,
    type SectionId,
    startupRouteName,
} from '@/shell/sections.ts'
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
// The logo resets to the configured startup page, which is what sets it apart
// from the Home rail button. Resolved here rather than in the `startup-page`
// route because that runs outside a component, where the store cannot be built.
const startupTarget = computed(() => ({ name: startupRouteName(settingsStore.startupPage) }))
</script>

<template>
    <nav class="flex h-full w-20 flex-col items-center gap-1 py-2">
        <RouterLink
            id="logo"
            :to="startupTarget"
            class="group rounded-lg p-1 outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
        >
            <!-- The glyph is a single gradient path, so cycling the hue on the
                 image matches what the old animated variant did to the path.
                 The identity filter is the resting state the transition eases
                 back to when the pointer leaves mid-cycle; without it the base
                 is `none`, which the transition would fight over on hover-in. -->
            <img
                src="/logo.svg"
                alt="CoolerControl"
                class="h-10 w-10 [filter:hue-rotate(0deg)] transition-[filter] duration-300 motion-safe:group-hover:animate-hue-rotate"
            />
        </RouterLink>
        <RouterLink
            v-for="section in railSections"
            :id="`rail-${section.id}`"
            :key="section.id"
            :to="{ name: section.routeName }"
            class="relative flex w-[4.5rem] flex-col items-center gap-0.5 rounded-lg px-1 py-2 outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
            :class="
                activeSection === section.id
                    ? 'text-accent'
                    : 'text-text-color-secondary hover:text-text-color'
            "
        >
            <!-- Brand mark for the current section. A theme whose gradient end
                 equals its accent renders this as a plain accent bar. -->
            <span
                v-if="activeSection === section.id"
                class="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-gradient-to-b from-accent to-accent-gradient-to"
            />
            <svg-icon type="mdi" :path="section.icon" :size="deviceStore.getREMSize(1.5)" />
            <span class="text-[0.8125rem] leading-tight">{{ t(section.labelKey) }}</span>
        </RouterLink>
        <div class="flex-1" />
        <RouterLink
            id="rail-settings"
            :to="{ name: 'settings' }"
            class="relative flex w-[4.5rem] flex-col items-center gap-0.5 rounded-lg px-1 py-2 outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
            :class="
                activeSection === 'settings'
                    ? 'text-accent'
                    : 'text-text-color-secondary hover:text-text-color'
            "
        >
            <span
                v-if="activeSection === 'settings'"
                class="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-gradient-to-b from-accent to-accent-gradient-to"
            />
            <svg-icon type="mdi" :path="mdiCog" :size="deviceStore.getREMSize(1.5)" />
            <span class="text-[0.8125rem] leading-tight">{{ t('layout.shell.settings') }}</span>
        </RouterLink>
        <!-- Both menus hang off the rail rather than over it. They are docked at the
             rail bottom, so `end` bottom-aligns them with their trigger. -->
        <UiDropdownMenu side="right" align="end" :side-offset="8">
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
        <UiDropdownMenu side="right" align="end" :side-offset="8">
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
