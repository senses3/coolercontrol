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
import { mdiArrowLeft, mdiContentSaveOutline } from '@mdi/js'
import UiSelect from '@/shell/ui/UiSelect.vue'
import { UID } from '@/models/Device.ts'
import { Profile, getProfileDisplayName } from '@/models/Profile.ts'
import { computed, ref, Ref } from 'vue'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import UiButton from '@/shell/ui/UiButton.vue'
import { v4 as uuidV4 } from 'uuid'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { DeviceSettingWriteProfileDTO } from '@/models/DaemonSettings.ts'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

interface Props {
    deviceUID: UID
    channelName: string
    selectedProfileUID?: UID
    isControlFlowView?: boolean
}

const emit = defineEmits<{
    (e: 'nextStep', step: number): void
    (e: 'close'): void
}>()
const props = defineProps<Props>()

const { t } = useI18n()
const settingsStore = useSettingsStore()
const deviceStore = useDeviceStore()
const router = useRouter()

const getProfileOptions = (): any[] =>
    settingsStore.profiles.filter((profile) => profile.uid !== '0')

const selectedProfile: Ref<Profile> = ref(
    // If the channel was Unmanaged ('0'), it has no real profile to "edit"; fall back to first non-default.
    settingsStore.profiles.find(
        (profile) => profile.uid === props.selectedProfileUID && profile.uid !== '0',
    ) ?? getProfileOptions()[0],
)

const profileSelectOptions = computed(() =>
    getProfileOptions().map((p) => ({ label: getProfileDisplayName(p), value: p.uid })),
)
const selectedProfileUid = computed<string | undefined>({
    get: () => selectedProfile.value?.uid,
    set: (uid) => {
        const found = getProfileOptions().find((p) => p.uid === uid)
        if (found != null) selectedProfile.value = found
    },
})

const saveSetting = async () => {
    const setting = new DeviceSettingWriteProfileDTO(selectedProfile.value.uid)
    await settingsStore.saveDaemonDeviceSettingProfile(props.deviceUID, props.channelName, setting)
    if (!props.isControlFlowView) {
        await router.push({
            name: 'device-speed',
            params: { deviceUID: props.deviceUID, channelName: props.channelName },
            query: { key: uuidV4() },
        })
    }
    emit('close')
}
</script>

<template>
    <div class="flex flex-col justify-between min-w-72 w-[40vw] min-h-max h-[40vh]">
        <div class="flex flex-col gap-y-4">
            <div class="mt-4 flex flex-col">
                <small class="ml-2 mb-1 text-sm">
                    {{ t('components.wizards.fanControl.existingProfile') }}:
                </small>
                <UiSelect
                    v-model="selectedProfileUid"
                    :options="profileSelectOptions"
                    placeholder="Profile"
                    class="w-full"
                />
            </div>
        </div>
        <div class="flex flex-row justify-between mt-4">
            <UiButton variant="ghost" class="w-24 bg-bg-one" @click="emit('nextStep', 1)">
                <svg-icon
                    class="outline-0"
                    type="mdi"
                    :path="mdiArrowLeft"
                    :size="deviceStore.getREMSize(1.5)"
                />
            </UiButton>
            <UiButton variant="solid" class="w-32" v-tooltip.top="'Apply'" @click="saveSetting">
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
