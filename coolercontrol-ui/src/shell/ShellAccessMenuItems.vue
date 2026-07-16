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
