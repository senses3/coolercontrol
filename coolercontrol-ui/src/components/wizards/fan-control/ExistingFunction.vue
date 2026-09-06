<!--
  SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon'
import { mdiArrowLeft } from '@mdi/js'
import UiGroupedSelect from '@/shell/ui/UiGroupedSelect.vue'
import { useLibraryGroups } from '@/shell/useLibraryGroups.ts'
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

const { functionGroups } = useLibraryGroups()
const functionSelectGroups = functionGroups(() =>
    getFunctionOptions().map((f) => ({ uid: f.uid, name: f.name })),
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
                <UiGroupedSelect
                    v-model="selectedFunctionUidModel"
                    :groups="functionSelectGroups"
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
