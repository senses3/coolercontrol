<!--
  SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon'
import UiInput from '@/shell/ui/UiInput.vue'
import UiButton from '@/shell/ui/UiButton.vue'
import { computed, inject, ref, Ref } from 'vue'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Emitter, EventType } from 'mitt'
import { DEFAULT_NAME_STRING_LENGTH, useDeviceStore } from '@/stores/DeviceStore.ts'
import { mdiContentSaveOutline } from '@mdi/js'

const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const router = useRouter()
const { t } = useI18n()
const emit = defineEmits<{
    (e: 'close'): void
}>()
const emitter: Emitter<Record<EventType, any>> = inject('emitter')!

const chosenName: Ref<string> = ref('New Mode')

const nameInvalid = computed(() => {
    return chosenName.value.length < 1 || chosenName.value.length > DEFAULT_NAME_STRING_LENGTH
})
const saveMode = async (): Promise<void> => {
    const newModeUID = await settingsStore.createMode(chosenName.value)
    if (newModeUID == null) return
    emitter.emit('mode-add-menu', { modeUID: newModeUID })
    await router.push({ name: 'modes', params: { modeUID: newModeUID } })
    emit('close')
}
</script>

<template>
    <div class="flex flex-col justify-between min-w-96 w-[40vw] min-h-max h-[40vh]">
        <div class="flex flex-col gap-y-4">
            <div>{{ t('layout.menu.tooltips.createMode') }}:</div>
            <div class="mt-0">
                <small class="ml-3 font-light text-sm"> {{ t('common.name') }}: </small>
                <div class="mt-0 flex flex-col">
                    <UiInput
                        v-model="chosenName"
                        autofocus
                        :placeholder="t('common.name')"
                        class="w-full"
                        :class="{ '!border-error': nameInvalid }"
                        @keydown.enter="saveMode"
                    />
                </div>
            </div>
        </div>
        <div class="flex flex-row justify-between mt-4">
            <UiButton variant="ghost" class="w-24 bg-bg-one" @click="emit('close')">
                {{ t('common.cancel') }}
            </UiButton>
            <UiButton
                variant="solid"
                class="w-32"
                v-tooltip.top="t('views.speed.applySetting')"
                @click="saveMode"
            >
                <svg-icon
                    class="outline-0"
                    type="mdi"
                    :path="mdiContentSaveOutline"
                    :size="deviceStore.getREMSize(1.5)"
                />
            </UiButton>
        </div>
    </div>
</template>

<style scoped lang="scss"></style>
