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
    mdiKeyOutline,
    mdiLockOutline,
    mdiLogin,
    mdiLogout,
    mdiOpenInNew,
    mdiPower,
    mdiRefresh,
    mdiShieldOutline,
    mdiSync,
} from '@mdi/js'
import { DropdownMenuItem } from 'reka-ui'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { useSystemActions } from '@/composables/useSystemActions.ts'
import { PLUGINS_SECTION, SHELL_SECTIONS, type SectionId } from '@/shell/sections.ts'
import UiDropdownMenu from '@/shell/ui/UiDropdownMenu.vue'

const route = useRoute()
const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()

const railSections = computed(() =>
    deviceStore.plugins.length > 0 ? [...SHELL_SECTIONS, PLUGINS_SECTION] : SHELL_SECTIONS,
)
const activeSection = computed(() => route.meta.section as SectionId | undefined)
const logoUrl = computed(() => (settingsStore.eyeCandy ? '/logo-animated.gif' : '/logo.svg'))
const { restartDaemonAndUI } = useSystemActions()

const logoutAndReload = async (): Promise<void> => {
    await deviceStore.logout()
    deviceStore.reloadUI()
}

const quitDesktopApp = (): void => {
    // @ts-ignore
    window.ipc.forceQuit()
}

// In the Qt app a target=_blank opens the user's default external browser.
const openInBrowser = (): void => {
    window.open(deviceStore.daemonClient.daemonURL, '_blank')
}

const itemClass =
    'flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-base ' +
    'text-text-color outline-none data-[highlighted]:bg-surface-hover'
</script>

<template>
    <nav class="flex h-full w-20 flex-col items-center gap-1 py-2">
        <RouterLink
            id="logo"
            :to="{ name: 'section-home' }"
            class="mb-1 mt-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
            <DropdownMenuItem
                v-if="!deviceStore.loggedIn"
                :class="itemClass"
                @select="deviceStore.login()"
            >
                <svg-icon type="mdi" :path="mdiLogin" :size="15" />
                {{ t('layout.topbar.login') }}
            </DropdownMenuItem>
            <template v-else>
                <DropdownMenuItem :class="itemClass" @select="logoutAndReload">
                    <svg-icon type="mdi" :path="mdiLogout" :size="15" />
                    {{ t('layout.topbar.logout') }}
                </DropdownMenuItem>
                <DropdownMenuItem :class="itemClass" @select="deviceStore.setPasswd()">
                    <svg-icon type="mdi" :path="mdiShieldOutline" :size="15" />
                    {{ t('layout.topbar.changePassword') }}
                </DropdownMenuItem>
                <DropdownMenuItem :class="itemClass" @select="deviceStore.manageTokens()">
                    <svg-icon type="mdi" :path="mdiKeyOutline" :size="15" />
                    {{ t('layout.topbar.accessTokens') }}
                </DropdownMenuItem>
            </template>
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
            <DropdownMenuItem
                v-if="deviceStore.isQtApp()"
                :class="itemClass"
                @select="openInBrowser"
            >
                <svg-icon type="mdi" :path="mdiOpenInNew" :size="15" />
                {{ t('layout.topbar.openInBrowser') }}
            </DropdownMenuItem>
            <DropdownMenuItem :class="itemClass" @select="deviceStore.reloadUI()">
                <svg-icon type="mdi" :path="mdiRefresh" :size="15" />
                {{ t('layout.topbar.restartUI') }}
            </DropdownMenuItem>
            <DropdownMenuItem :class="itemClass" @select="restartDaemonAndUI">
                <svg-icon type="mdi" :path="mdiSync" :size="15" />
                {{ t('layout.topbar.restartDaemonAndUI') }}
            </DropdownMenuItem>
            <DropdownMenuItem
                v-if="deviceStore.isQtApp()"
                :class="itemClass"
                @select="quitDesktopApp"
            >
                <svg-icon type="mdi" :path="mdiPower" :size="15" />
                {{ t('layout.topbar.quitDesktopApp') }}
            </DropdownMenuItem>
        </UiDropdownMenu>
    </nav>
</template>
