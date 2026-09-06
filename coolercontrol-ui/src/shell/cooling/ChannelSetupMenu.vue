<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiAutoFix, mdiChartMultiple, mdiSpeedometer } from '@mdi/js'
import { DropdownMenuItem, DropdownMenuSeparator } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import type { UID } from '@/models/Device.ts'
import { useFanControlWizard } from '@/composables/useFanControlWizard.ts'
import { useToolWizards } from '@/composables/useToolWizards.ts'
import UiDropdownMenu from '@/shell/ui/UiDropdownMenu.vue'

const props = defineProps<{ deviceUID: UID; channelName: string }>()

const { t } = useI18n()
const fanWizard = useFanControlWizard()
const { openGenerateWizard, openCalibrationWizard } = useToolWizards()

const scope = (): { deviceUID: UID; channelName: string } => ({
    deviceUID: props.deviceUID,
    channelName: props.channelName,
})

const autoCreateThisFan = (): void => openGenerateWizard(scope())
const autoCreateAllFans = (): void => openGenerateWizard()
// Opens the fan-control wizard straight at its New Profile step for this fan.
const createNewProfile = (): void =>
    fanWizard.open({ deviceUID: props.deviceUID, channelName: props.channelName, initialStep: 3 })
const calibrateThisFan = (): void => openCalibrationWizard([scope()])
const calibrateAllFans = (): void => openCalibrationWizard()

const itemClass =
    'flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-base ' +
    'text-text-color outline-none data-[highlighted]:bg-surface-hover'
</script>

<template>
    <UiDropdownMenu align="start">
        <template #trigger>
            <slot name="trigger" />
        </template>
        <DropdownMenuItem :class="itemClass" @select="autoCreateThisFan">
            <svg-icon type="mdi" :path="mdiAutoFix" :size="15" class="text-text-color-secondary" />
            {{ t('layout.shell.coolingPage.setupMenu.autoCreateThisFan') }}
        </DropdownMenuItem>
        <DropdownMenuItem :class="itemClass" @select="createNewProfile">
            <svg-icon
                type="mdi"
                :path="mdiChartMultiple"
                :size="15"
                class="text-text-color-secondary"
            />
            {{ t('layout.shell.coolingPage.setupMenu.createProfile') }}
        </DropdownMenuItem>
        <DropdownMenuItem :class="itemClass" @select="calibrateThisFan">
            <svg-icon
                type="mdi"
                :path="mdiSpeedometer"
                :size="15"
                class="text-text-color-secondary"
            />
            {{ t('layout.shell.coolingPage.setupMenu.calibrateThisFan') }}
        </DropdownMenuItem>
        <DropdownMenuSeparator class="my-1 h-px bg-border-one" />
        <DropdownMenuItem :class="itemClass" @select="autoCreateAllFans">
            <svg-icon type="mdi" :path="mdiAutoFix" :size="15" class="text-text-color-secondary" />
            {{ t('layout.shell.coolingPage.setupMenu.autoCreateAllFans') }}
        </DropdownMenuItem>
        <DropdownMenuItem :class="itemClass" @select="calibrateAllFans">
            <svg-icon
                type="mdi"
                :path="mdiSpeedometer"
                :size="15"
                class="text-text-color-secondary"
            />
            {{ t('layout.shell.coolingPage.setupMenu.calibrateAllFans') }}
        </DropdownMenuItem>
    </UiDropdownMenu>
</template>
