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

<!-- Power (restart/quit) menu rows, shared by the desktop rail and the mobile header
     overflow. Render inside a UiDropdownMenu. -->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiOpenInNew, mdiPower, mdiRefresh, mdiSync } from '@mdi/js'
import { DropdownMenuItem } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSystemActions } from '@/composables/useSystemActions.ts'
import { dropdownItemClass } from '@/shell/ui/dropdownItemClass.ts'

const { t } = useI18n()
const deviceStore = useDeviceStore()
const { restartDaemonAndUI } = useSystemActions()

// In the Qt app a target=_blank opens the user's default external browser.
const openInBrowser = (): void => {
    window.open(deviceStore.daemonClient.daemonURL, '_blank')
}

const quitDesktopApp = (): void => {
    // @ts-ignore
    window.ipc.forceQuit()
}
</script>

<template>
    <DropdownMenuItem
        v-if="deviceStore.isQtApp()"
        :class="dropdownItemClass"
        @select="openInBrowser"
    >
        <svg-icon type="mdi" :path="mdiOpenInNew" :size="15" />
        {{ t('layout.topbar.openInBrowser') }}
    </DropdownMenuItem>
    <DropdownMenuItem :class="dropdownItemClass" @select="deviceStore.reloadUI()">
        <svg-icon type="mdi" :path="mdiRefresh" :size="15" />
        {{ t('layout.topbar.restartUI') }}
    </DropdownMenuItem>
    <DropdownMenuItem :class="dropdownItemClass" @select="restartDaemonAndUI">
        <svg-icon type="mdi" :path="mdiSync" :size="15" />
        {{ t('layout.topbar.restartDaemonAndUI') }}
    </DropdownMenuItem>
    <DropdownMenuItem
        v-if="deviceStore.isQtApp()"
        :class="dropdownItemClass"
        @select="quitDesktopApp"
    >
        <svg-icon type="mdi" :path="mdiPower" :size="15" />
        {{ t('layout.topbar.quitDesktopApp') }}
    </DropdownMenuItem>
</template>
