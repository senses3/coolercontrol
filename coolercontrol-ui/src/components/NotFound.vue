<!--
  SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
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
