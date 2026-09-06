<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<!-- Access (auth) menu rows, shared by the desktop rail and the mobile header overflow.
     Render inside a UiDropdownMenu. -->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiKeyOutline, mdiLogin, mdiLogout, mdiShieldOutline } from '@mdi/js'
import { DropdownMenuItem } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { dropdownItemClass } from '@/shell/ui/dropdownItemClass.ts'

const { t } = useI18n()
const deviceStore = useDeviceStore()

const logoutAndReload = async (): Promise<void> => {
    await deviceStore.logout()
    deviceStore.reloadUI()
}
</script>

<template>
    <DropdownMenuItem
        v-if="!deviceStore.loggedIn"
        :class="dropdownItemClass"
        @select="deviceStore.login()"
    >
        <svg-icon type="mdi" :path="mdiLogin" :size="15" />
        {{ t('layout.topbar.login') }}
    </DropdownMenuItem>
    <template v-else>
        <DropdownMenuItem :class="dropdownItemClass" @select="logoutAndReload">
            <svg-icon type="mdi" :path="mdiLogout" :size="15" />
            {{ t('layout.topbar.logout') }}
        </DropdownMenuItem>
        <DropdownMenuItem :class="dropdownItemClass" @select="deviceStore.setPasswd()">
            <svg-icon type="mdi" :path="mdiShieldOutline" :size="15" />
            {{ t('layout.topbar.changePassword') }}
        </DropdownMenuItem>
        <DropdownMenuItem :class="dropdownItemClass" @select="deviceStore.manageTokens()">
            <svg-icon type="mdi" :path="mdiKeyOutline" :size="15" />
            {{ t('layout.topbar.accessTokens') }}
        </DropdownMenuItem>
    </template>
</template>
