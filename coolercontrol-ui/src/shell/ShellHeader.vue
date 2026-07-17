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
import {
    mdiArrowLeft,
    mdiBookmarkCheck,
    mdiBookmarkMultipleOutline,
    mdiBookmarkOutline,
    mdiDockLeft,
    mdiDotsVertical,
    mdiTune,
} from '@mdi/js'
import { DropdownMenuItem, DropdownMenuSeparator } from 'reka-ui'
import { computed, inject } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { DaemonStatus, useDaemonState } from '@/stores/DaemonState.ts'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { PLUGINS_SECTION } from '@/shell/sections.ts'
import UiButton from '@/shell/ui/UiButton.vue'
import UiDropdownMenu from '@/shell/ui/UiDropdownMenu.vue'
import UiTooltip from '@/shell/ui/UiTooltip.vue'
import ShellAccessMenuItems from '@/shell/ShellAccessMenuItems.vue'
import ShellPowerMenuItems from '@/shell/ShellPowerMenuItems.vue'
import { dropdownItemClass } from '@/shell/ui/dropdownItemClass.ts'

const { t } = useI18n()
const router = useRouter()
const daemonState = useDaemonState()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()

const statusColor = computed(() => {
    switch (daemonState.status) {
        case DaemonStatus.OK:
            return 'bg-success'
        case DaemonStatus.WARN:
            return 'bg-warning'
        default:
            return 'bg-error'
    }
})
// A degraded status jumps straight to the logs, pre-filtered to warnings.
const statusTarget = computed(() =>
    daemonState.status === DaemonStatus.OK
        ? { name: 'section-home' }
        : { name: 'home-logs', query: { level: 'warn' } },
)

const activeModeName = computed<string | undefined>(
    () => settingsStore.modes.find((mode) => mode.uid === settingsStore.modeActiveCurrent)?.name,
)

// Provided by ShellLayout; toggles the reka splitter panel (desktop only).
const toggleMainMenu = inject<() => void>('toggleMainMenu')

// The main-menu panel and the Access/Power menus live in the desktop rail, which
// mobile does not render. Mirror ShellLayout's breakpoint so the header can hide the
// panel-collapse button on mobile and surface those menus in an overflow instead.
const { width } = useWindowSize()
const isMobile = computed(() => width.value < 768)
</script>

<template>
    <header class="flex h-12 shrink-0 items-center gap-2.5 px-3">
        <!-- The Qt app has no browser back button, so provide one. It sits at the
             far left, where a browser's back button would be. -->
        <UiTooltip v-if="deviceStore.isQtApp()" :text="t('layout.topbar.back')">
            <button
                type="button"
                class="flex items-center justify-center rounded-lg p-1.5 text-text-color-secondary outline-none hover:bg-surface-hover hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                @click="router.back()"
            >
                <svg-icon type="mdi" :path="mdiArrowLeft" :size="deviceStore.getREMSize(1.25)" />
            </button>
        </UiTooltip>
        <UiTooltip
            v-if="!isMobile"
            :text="
                settingsStore.collapsedMainMenu
                    ? t('layout.topbar.expandMenu')
                    : t('layout.topbar.collapseMenu')
            "
        >
            <button
                type="button"
                class="flex items-center justify-center rounded-lg p-1.5 text-text-color-secondary outline-none hover:bg-surface-hover hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                @click="toggleMainMenu?.()"
            >
                <svg-icon type="mdi" :path="mdiDockLeft" :size="deviceStore.getREMSize(1.25)" />
            </button>
        </UiTooltip>
        <UiTooltip :text="daemonState.status">
            <RouterLink
                :to="statusTarget"
                class="flex items-center gap-2.5 rounded-lg px-1 py-0.5 outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
            >
                <span class="h-2.5 w-2.5 rounded-full" :class="statusColor" />
                <span class="text-base text-text-color-secondary">
                    {{ daemonState.systemName }}
                </span>
            </RouterLink>
        </UiTooltip>
        <div class="flex-1" />
        <UiDropdownMenu>
            <template #trigger>
                <UiButton id="modes-switcher" variant="outline">
                    <svg-icon
                        type="mdi"
                        :path="mdiBookmarkMultipleOutline"
                        :size="deviceStore.getREMSize(1.1)"
                    />
                    {{ activeModeName ?? t('layout.shell.modes') }}
                </UiButton>
            </template>
            <DropdownMenuItem
                v-for="mode in settingsStore.modes"
                :key="mode.uid"
                :class="dropdownItemClass"
                @select="settingsStore.activateMode(mode.uid)"
            >
                <svg-icon
                    type="mdi"
                    :path="
                        mode.uid === settingsStore.modeActiveCurrent
                            ? mdiBookmarkCheck
                            : mdiBookmarkOutline
                    "
                    :size="15"
                    :class="
                        mode.uid === settingsStore.modeActiveCurrent
                            ? 'text-accent'
                            : 'text-text-color-secondary'
                    "
                />
                <span class="truncate">{{ mode.name }}</span>
            </DropdownMenuItem>
            <div
                v-if="settingsStore.modes.length === 0"
                class="px-2 py-1.5 text-sm text-text-color-secondary"
            >
                {{ t('layout.shell.noModes') }}
            </div>
            <DropdownMenuSeparator class="my-1 h-px bg-border-one" />
            <DropdownMenuItem
                :class="dropdownItemClass"
                @select="router.push({ name: 'cooling-modes' })"
            >
                <svg-icon type="mdi" :path="mdiTune" :size="15" class="text-text-color-secondary" />
                {{ t('layout.shell.manageModes') }}
            </DropdownMenuItem>
        </UiDropdownMenu>
        <!-- Mobile has no rail, so its Plugins/Access/Power entries live here. -->
        <UiDropdownMenu v-if="isMobile">
            <template #trigger>
                <button
                    type="button"
                    class="flex items-center justify-center rounded-lg p-1.5 text-text-color-secondary outline-none hover:bg-surface-hover hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                >
                    <svg-icon
                        type="mdi"
                        :path="mdiDotsVertical"
                        :size="deviceStore.getREMSize(1.25)"
                    />
                </button>
            </template>
            <DropdownMenuItem
                :class="dropdownItemClass"
                @select="router.push({ name: PLUGINS_SECTION.routeName })"
            >
                <svg-icon type="mdi" :path="PLUGINS_SECTION.icon" :size="15" />
                {{ t(PLUGINS_SECTION.labelKey) }}
            </DropdownMenuItem>
            <DropdownMenuSeparator class="my-1 h-px bg-border-one" />
            <ShellAccessMenuItems />
            <DropdownMenuSeparator class="my-1 h-px bg-border-one" />
            <ShellPowerMenuItems />
        </UiDropdownMenu>
    </header>
</template>
