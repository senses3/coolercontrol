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
import { mdiArrowLeft } from '@mdi/js'
import UiSelect from '@/shell/ui/UiSelect.vue'
import { UID } from '@/models/Device.ts'
import { Function } from '@/models/Profile.ts'
import { computed, ref, Ref } from 'vue'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import UiButton from '@/shell/ui/UiButton.vue'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useI18n } from 'vue-i18n'

interface Props {
    selectedFunctionUID: UID
}

const emit = defineEmits<{
    (e: 'nextStep', step: number): void
    (e: 'functionUID', funUID: UID): void
}>()
const props = defineProps<Props>()

const { t } = useI18n()
const settingsStore = useSettingsStore()
const deviceStore = useDeviceStore()

const selectedFunction: Ref<Function> = ref(
    settingsStore.functions.find((fun) => fun.uid === props.selectedFunctionUID)!,
)

const getFunctionOptions = (): any[] => settingsStore.functions

const functionSelectOptions = computed(() =>
    getFunctionOptions().map((f) => ({ label: f.name, value: f.uid })),
)
const selectedFunctionUidModel = computed<string | undefined>({
    get: () => selectedFunction.value?.uid,
    set: (uid) => {
        const found = getFunctionOptions().find((f) => f.uid === uid)
        if (found != null) selectedFunction.value = found
    },
})

const nextStep = () => {
    if (selectedFunction.value == null) {
        return
    }
    emit('functionUID', selectedFunction.value.uid)
    emit('nextStep', 13)
}
</script>

<template>
    <div class="flex flex-col justify-between min-w-96 w-[40vw] min-h-max h-[40vh]">
        <div class="flex flex-col gap-y-4">
            <div class="mt-0 flex flex-col">
                <small class="ml-2 mb-1 font-light text-sm">
                    {{ t('components.wizards.fanControl.existingFunction') }}:
                </small>
                <UiSelect
                    v-model="selectedFunctionUidModel"
                    :options="functionSelectOptions"
                    placeholder="Function"
                    class="w-full"
                />
            </div>
        </div>
        <div class="flex flex-row justify-between mt-4">
            <UiButton variant="ghost" class="w-24 bg-bg-one" @click="emit('nextStep', 10)">
                <svg-icon
                    class="outline-0"
                    type="mdi"
                    :path="mdiArrowLeft"
                    :size="deviceStore.getREMSize(1.5)"
                />
            </UiButton>
            <UiButton
                variant="ghost"
                class="w-24 bg-bg-one"
                :disabled="selectedFunction == null"
                @click="nextStep"
            >
                {{ t('common.next') }}
            </UiButton>
        </div>
    </div>
</template>

<style scoped lang="scss"></style>
