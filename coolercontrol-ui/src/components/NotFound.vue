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
import SvgIcon from '@jamescoyle/vue-icon'
import { mdiHome } from '@mdi/js'
import UiButton from '@/shell/ui/UiButton.vue'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useI18n } from 'vue-i18n'

const { getREMSize } = useDeviceStore()
const { t } = useI18n()
</script>

<template>
    <div class="flex flex-wrap items-center gap-3 px-4 pt-4">
        <h1 class="text-xl font-semibold text-text-color">{{ t('views.error.pageNotFound') }}</h1>
    </div>
    <div class="m-10 text-center font-bold text-2xl">
        <p>{{ t('components.notFound.message') }}</p>
        <router-link to="/">
            <UiButton
                variant="solid"
                class="mt-16 w-64 !h-12 border-2 !bg-accent/70 !p-0 !text-text-color-secondary outline-0 hover:!bg-accent hover:!text-text-color"
            >
                {{ t('views.error.returnToDashboard') }}
                <svg-icon class="ml-4" type="mdi" :path="mdiHome" :size="getREMSize(1.75)" />
            </UiButton>
        </router-link>
    </div>
</template>

<style scoped lang="scss"></style>
