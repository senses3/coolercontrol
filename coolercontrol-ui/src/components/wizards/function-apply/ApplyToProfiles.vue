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
import { computed, ref, Ref } from 'vue'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { mdiContentSaveOutline } from '@mdi/js'
import UiButton from '@/shell/ui/UiButton.vue'
import UiMultiSelect from '@/shell/ui/UiMultiSelect.vue'
import { type UiOptionGroup } from '@/shell/ui/UiGroupedListbox.vue'
import { UID } from '@/models/Device.ts'
import { ProfileType } from '@/models/Profile.ts'
import { useToast } from '@/shell/toast'
import { useRoute, useRouter } from 'vue-router'

const emit = defineEmits<{
    (e: 'close'): void
}>()

const props = defineProps<{
    functionUID: UID
}>()

interface ProfileOption {
    profileUID: UID
    profileName: string
    functionUID: UID
}

const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const toast = useToast()
const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const profileOptions: Ref<Array<ProfileOption>> = ref([])
const chosenProfiles: Ref<Array<ProfileOption>> = ref([])
const functionName =
    settingsStore.functions.find((fun) => fun.uid === props.functionUID)?.name ?? 'unknown'

const fillProfileOptions = (): void => {
    profileOptions.value = settingsStore.profiles
        // exclude default Profile & only allow Graph Profiles - which actually use Functions
        .filter((profile) => profile.uid !== '0' && profile.p_type === ProfileType.Graph)
        .map((profile) => {
            return {
                profileUID: profile.uid,
                profileName: profile.name,
                functionUID: profile.function_uid,
            }
        })
}
fillProfileOptions()

const setAlreadyAppliedProfiles = (): void => {
    for (const profile of profileOptions.value) {
        if (profile.functionUID !== props.functionUID) continue
        chosenProfiles.value.push(profile)
    }
}
setAlreadyAppliedProfiles()

const profileGroups = computed<UiOptionGroup[]>(() => [
    {
        label: '',
        options: profileOptions.value.map((profile) => ({
            label: profile.profileName,
            value: profile.profileUID,
        })),
    },
])
const chosenProfileUids = computed<string[]>({
    get: () => chosenProfiles.value.map((profile) => profile.profileUID),
    set: (uids) => {
        chosenProfiles.value = uids
            .map((uid) => profileOptions.value.find((profile) => profile.profileUID === uid))
            .filter((profile): profile is ProfileOption => profile != null)
    },
})

const applyFunctionToProfiles = async (): Promise<void> => {
    for (const profile of chosenProfiles.value) {
        // we route away from profiles currently open to avoid UI conflicts
        if (route.params != null && route.params.profileUID === profile.profileUID) {
            await router.push({ name: 'startup-page' })
        }
        settingsStore.profiles.find((p) => p.uid === profile.profileUID)!.function_uid =
            props.functionUID
        const successful = await settingsStore.updateProfile(profile.profileUID)
        if (successful) {
            toast.add({
                severity: 'success',
                summary: t('common.success'),
                detail: t('views.profiles.profileUpdated'),
                life: 3000,
            })
        } else {
            toast.add({
                severity: 'error',
                summary: t('common.error'),
                detail: t('views.profiles.profileUpdateError'),
                life: 3000,
            })
        }
    }
    emit('close')
}
</script>

<template>
    <div class="flex flex-col justify-between min-w-96 w-[40vw] min-h-max h-[40vh]">
        <div class="flex flex-col gap-y-4">
            <p class="my-2 text-center text-lg">
                <span class="font-bold">{{ functionName }}</span>
            </p>
            <small class="ml-3 font-light text-sm">
                {{ t('components.wizards.functionApply.profilesApply') }}
            </small>
            <span
                v-tooltip.top="{
                    escape: false,
                    value: t('components.wizards.functionApply.profilesTooltip'),
                }"
            >
                <UiMultiSelect
                    v-model="chosenProfileUids"
                    :groups="profileGroups"
                    filter
                    :filter-placeholder="t('common.search')"
                    :invalid="chosenProfiles.length === 0"
                    :placeholder="t('components.wizards.functionApply.selectProfiles')"
                    class="w-full"
                />
            </span>
        </div>
        <div class="flex flex-row justify-between mt-4">
            <UiButton variant="ghost" class="w-24 bg-bg-one" @click="emit('close')">
                {{ t('common.cancel') }}
            </UiButton>
            <UiButton
                variant="solid"
                class="w-32 !bg-accent/80 !text-text-color hover:!bg-accent"
                :disabled="chosenProfiles.length === 0"
                v-tooltip.top="t('views.speed.applySetting')"
                @click="applyFunctionToProfiles"
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
