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
import UiButton from '@/shell/ui/UiButton.vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { mdiArrowLeft, mdiButtonCursor, mdiFlaskEmptyOutline, mdiPlusBoxOutline } from '@mdi/js'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { UID } from '@/models/Device.ts'

interface Props {
    name: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
    (e: 'functionUID', funUID: UID): void
    (e: 'nextStep', step: number): void
}>()
const { t } = useI18n()
const settingsStore = useSettingsStore()
const deviceStore = useDeviceStore()

const functionsLength: number = settingsStore.functions.length

const defaultFunctionAction = () => {
    emit('functionUID', '0')
    emit('nextStep', 13)
}
</script>

<template>
    <div class="flex flex-col justify-between min-w-96 w-[40vw] min-h-max h-[40vh]">
        <div class="flex flex-col gap-y-4">
            <p>
                {{ t('components.wizards.fanControl.functionFor') }}:
                <span class="font-bold">{{ props.name }}</span>
            </p>
            <p>
                <span v-html="t('components.wizards.fanControl.functionDescription')" />
            </p>
            <UiButton
                variant="ghost"
                class="!p-2 h-11 bg-bg-one !justify-start"
                @click="defaultFunctionAction"
            >
                <div class="flex flex-row font-semibold items-center">
                    <svg-icon
                        class="outline-0 mr-2"
                        type="mdi"
                        :path="mdiFlaskEmptyOutline"
                        :size="deviceStore.getREMSize(1.5)"
                    />
                    {{ t('components.wizards.fanControl.defaultFunction') }}
                </div>
            </UiButton>
            <UiButton
                v-if="functionsLength > 1"
                variant="ghost"
                class="!p-2 h-11 bg-bg-one !justify-start"
                @click="emit('nextStep', 12)"
            >
                <div class="flex flex-row font-semibold items-center">
                    <svg-icon
                        class="outline-0 mr-2"
                        type="mdi"
                        :path="mdiButtonCursor"
                        :size="deviceStore.getREMSize(1.5)"
                    />
                    {{ t('components.wizards.fanControl.existingFunction') }}
                </div>
            </UiButton>
            <UiButton
                variant="ghost"
                class="!p-2 h-11 bg-bg-one !justify-start"
                @click="emit('nextStep', 11)"
            >
                <div class="flex flex-row font-semibold items-center">
                    <svg-icon
                        class="outline-0 mr-2"
                        type="mdi"
                        :path="mdiPlusBoxOutline"
                        :size="deviceStore.getREMSize(1.5)"
                    />
                    {{ t('components.wizards.fanControl.createNewFunction') }}
                </div>
            </UiButton>
        </div>
        <div class="flex flex-row justify-between mt-4">
            <UiButton variant="ghost" class="w-24 h-11 bg-bg-one" @click="emit('nextStep', 9)">
                <svg-icon
                    class="outline-0"
                    type="mdi"
                    :path="mdiArrowLeft"
                    :size="deviceStore.getREMSize(1.5)"
                />
            </UiButton>
        </div>
    </div>
</template>

<style scoped lang="scss"></style>
