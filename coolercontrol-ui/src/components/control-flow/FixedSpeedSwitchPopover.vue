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
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Popover from 'primevue/popover'
import Slider from 'primevue/slider'
import Button from 'primevue/button'
import { useSettingsStore } from '@/stores/SettingsStore'
import type { UID } from '@/models/Device'

const props = defineProps<{
    profileUID: UID
    currentSpeedFixed: number
}>()

const emit = defineEmits<{
    (e: 'changed'): void
}>()

const { t } = useI18n()
const settingsStore = useSettingsStore()
const popRef = ref()
const localSpeed = ref(props.currentSpeedFixed)

function toggle(event: Event) {
    localSpeed.value = props.currentSpeedFixed
    popRef.value?.toggle(event)
}

async function applySpeed() {
    if (localSpeed.value === props.currentSpeedFixed) {
        popRef.value?.hide()
        return
    }
    const profile = settingsStore.profiles.find((p) => p.uid === props.profileUID)
    if (!profile) return
    profile.speed_fixed = localSpeed.value
    await settingsStore.updateProfile(props.profileUID)
    popRef.value?.hide()
    emit('changed')
}

defineExpose({ toggle })
</script>

<template>
    <Popover ref="popRef" append-to="body">
        <div class="w-64 rounded-lg border border-border-one bg-bg-two p-3">
            <div class="mb-3 text-sm font-semibold text-text-color">
                {{ t('views.controls.adjustFixedSpeed') }}
            </div>
            <div class="mb-2 text-center text-lg font-bold text-text-color">
                {{ localSpeed }}{{ t('common.percentUnit') }}
            </div>
            <div class="px-1">
                <Slider v-model="localSpeed" :min="0" :max="100" :step="1" class="!w-full" />
            </div>
            <div class="mt-3 border-t border-border-one pt-2">
                <Button
                    :label="t('common.apply')"
                    class="w-full !bg-accent/80 !text-white hover:!bg-accent"
                    size="small"
                    :disabled="localSpeed === currentSpeedFixed"
                    @click="applySpeed"
                />
            </div>
        </div>
    </Popover>
</template>
