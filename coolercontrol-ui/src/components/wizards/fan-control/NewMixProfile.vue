<!--
  SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon'
import { mdiArrowLeft, mdiContentSaveOutline } from '@mdi/js'
import { UID } from '@/models/Device.ts'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useRouter } from 'vue-router'
import { DeviceSettingWriteProfileDTO } from '@/models/DaemonSettings.ts'
import { v4 as uuidV4 } from 'uuid'
import {
    getProfileMixFunctionTypeDisplayName,
    Profile,
    ProfileMixFunctionType,
    ProfileType,
} from '@/models/Profile.ts'
import { useToast } from '@/shell/toast'
import { computed, inject, ref, Ref } from 'vue'
import UiMultiSelect from '@/shell/ui/UiMultiSelect.vue'
import UiSelect from '@/shell/ui/UiSelect.vue'
import UiButton from '@/shell/ui/UiButton.vue'
import { type UiOptionGroup } from '@/shell/ui/UiGroupedListbox.vue'
import { $enum } from 'ts-enum-util'
import { Emitter, EventType } from 'mitt'

interface Props {
    deviceUID: UID
    channelName: string
    name: string
    isControlFlowView?: boolean
}

const emit = defineEmits<{
    (e: 'nextStep', step: number): void
    (e: 'close'): void
}>()
const props = defineProps<Props>()

const { t } = useI18n()
const emitter: Emitter<Record<EventType, any>> = inject('emitter')!
const settingsStore = useSettingsStore()
const deviceStore = useDeviceStore()
const toast = useToast()
const router = useRouter()

const channelLabel =
    settingsStore.allUIDeviceSettings
        .get(props.deviceUID)
        ?.sensorsAndChannels.get(props.channelName)?.name ?? props.channelName

const chosenProfileMixFunction: Ref<ProfileMixFunctionType> = ref(ProfileMixFunctionType.Max)
const mixFunctionTypeOptions = computed(() => {
    return [...$enum(ProfileMixFunctionType).values()].map((type) => ({
        value: type,
        label: getProfileMixFunctionTypeDisplayName(type),
    }))
})
const chosenMemberProfiles: Ref<Array<Profile>> = ref([])
const memberProfileOptions: Ref<Array<Profile>> = computed(() =>
    settingsStore.profiles.filter((profile) => {
        if (profile.p_type === ProfileType.Graph) return true
        if (profile.p_type === ProfileType.Fixed) return true
        if (profile.p_type !== ProfileType.Mix) return false
        // Exclude Mix profiles that already have Mix sub-members
        const hasMixSubMembers = profile.member_profile_uids.some(
            (uid) => settingsStore.profiles.find((p) => p.uid === uid)?.p_type === ProfileType.Mix,
        )
        return !hasMixSubMembers
    }),
)
const chosenMemberProfileUids = computed<string[]>({
    get: () => chosenMemberProfiles.value.map((p) => p.uid),
    set: (uids) => {
        chosenMemberProfiles.value = uids
            .map((uid) => memberProfileOptions.value.find((p) => p.uid === uid))
            .filter((p): p is Profile => p != null)
    },
})
const memberProfileGroups = computed<UiOptionGroup[]>(() => [
    {
        label: '',
        options: memberProfileOptions.value.map((p) => ({ label: p.name, value: p.uid })),
    },
])
const chosenProfileMixFunctionModel = computed<string | undefined>({
    get: () => chosenProfileMixFunction.value,
    set: (v) => {
        if (v != null) chosenProfileMixFunction.value = v as ProfileMixFunctionType
    },
})
const saveSetting = async () => {
    if (chosenMemberProfiles.value.length < 2) {
        toast.add({
            severity: 'error',
            summary: t('common.error'),
            detail: t('views.profiles.memberProfilesRequired'),
            life: 4000,
        })
        return
    }
    const newProfile = new Profile(props.name, ProfileType.Mix)
    newProfile.member_profile_uids = chosenMemberProfiles.value.map((p) => p.uid)
    newProfile.mix_function_type = chosenProfileMixFunction.value
    settingsStore.profiles.push(newProfile)
    await settingsStore.saveProfile(newProfile.uid)
    emitter.emit('profile-add-menu', { profileUID: newProfile.uid })
    const setting = new DeviceSettingWriteProfileDTO(newProfile.uid)
    await settingsStore.saveDaemonDeviceSettingProfile(props.deviceUID, props.channelName, setting)
    toast.add({
        severity: 'success',
        summary: t('common.success'),
        detail: t('components.wizards.fanControl.profileCreatedApplied'),
        life: 3000,
    })
    emit('close')
    if (!props.isControlFlowView) {
        await router.push({
            name: 'device-speed',
            params: { deviceUID: props.deviceUID, channelName: props.channelName },
            query: { key: uuidV4() },
        })
    }
}
</script>

<template>
    <div class="flex flex-col justify-between min-w-96 w-[40vw] min-h-max h-[40vh]">
        <div class="flex flex-col gap-y-4">
            <div class="w-full text-lg">
                {{ t('components.wizards.fanControl.newMixProfile') }}:
                <span class="font-bold">{{ props.name }}</span
                ><br /><br />
                {{ t('components.wizards.fanControl.willCreatedAndAppliedTo') }}
                <span class="font-bold">{{ channelLabel }}</span
                ><br /><br />{{ t('components.wizards.fanControl.withSettings') }}:
            </div>
            <div class="mt-0 flex flex-col">
                <small class="ml-2 mb-1 font-light text-sm">
                    {{ t('views.profiles.profilesToMix') }}
                </small>
                <UiMultiSelect
                    v-model="chosenMemberProfileUids"
                    :groups="memberProfileGroups"
                    :placeholder="t('views.profiles.memberProfiles')"
                    :invalid="chosenMemberProfiles.length < 2"
                    class="w-full"
                />
            </div>
            <div class="mt-0 flex flex-col">
                <small class="ml-2 mb-1 font-light text-sm">
                    {{ t('views.profiles.applyMixFunction') }}
                </small>
                <UiSelect
                    v-model="chosenProfileMixFunctionModel"
                    :options="mixFunctionTypeOptions"
                    :placeholder="t('views.profiles.applyMixFunction')"
                    class="w-full"
                />
            </div>
        </div>
        <div class="flex flex-row justify-between mt-4">
            <UiButton variant="ghost" class="w-24 bg-bg-one" @click="emit('nextStep', 3)">
                <svg-icon
                    class="outline-0"
                    type="mdi"
                    :path="mdiArrowLeft"
                    :size="deviceStore.getREMSize(1.5)"
                />
            </UiButton>
            <UiButton
                variant="solid"
                class="w-32"
                v-tooltip.top="t('views.speed.applySetting')"
                :disabled="chosenMemberProfiles.length < 2"
                @click="saveSetting"
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
