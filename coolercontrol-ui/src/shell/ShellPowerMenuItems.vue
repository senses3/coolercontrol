<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
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
