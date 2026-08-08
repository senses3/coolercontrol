<!--
  SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon'
import UiSelect from '@/shell/ui/UiSelect.vue'
import UiButton from '@/shell/ui/UiButton.vue'
import { computed, ref, type Ref } from 'vue'
import { getProfileTypeDisplayName, ProfileType } from '@/models/Profile.ts'
import { $enum } from 'ts-enum-util'
import { DEFAULT_NAME_STRING_LENGTH } from '@/stores/DeviceStore.ts'
import UiInput from '@/shell/ui/UiInput.vue'
import { useI18n } from 'vue-i18n'

interface Props {
    name: string
    type: ProfileType
}

const props = defineProps<Props>()
const emit = defineEmits<{
    (e: 'nextStep', step: number): void
    (e: 'profileName', name: string): void
    (e: 'profileType', type: ProfileType): void
    (e: 'close'): void
}>()

const { t } = useI18n()

const selectedType: Ref<ProfileType> = ref(props.type)
const selectedTypeModel = computed<string | undefined>({
    get: () => selectedType.value,
    set: (value) => {
        if (value != null) selectedType.value = value as ProfileType
    },
})
const profileTypeOptions = computed(() => {
    return [...$enum(ProfileType).values()].map((type) => ({
        value: type,
        label: getProfileTypeDisplayName(type),
    }))
})
const nameInput: Ref<string> = ref(props.name)
const nameInvalid = computed(() => {
    return nameInput.value.length < 1 || nameInput.value.length > DEFAULT_NAME_STRING_LENGTH
})

const nextStep = () => {
    emit('profileName', nameInput.value)
    emit('profileType', selectedType.value)
    switch (selectedType.value) {
        case ProfileType.Default:
            emit('nextStep', 13)
            break
        case ProfileType.Fixed:
            emit('nextStep', 6)
            break
        case ProfileType.Mix:
            emit('nextStep', 7)
            break
        case ProfileType.Graph:
            emit('nextStep', 8)
            break
        case ProfileType.Overlay:
            emit('nextStep', 100)
            break
    }
}
</script>

<template>
    <div class="flex flex-col justify-between min-w-96 w-[40vw] min-h-max h-[40vh]">
        <div class="flex flex-col gap-y-4">
            <div class="w-full mb-2">
                {{ t('components.wizards.fanControl.chooseProfileNameType') }}:
            </div>
            <div class="mt-0 flex flex-col">
                <UiInput
                    v-model="nameInput"
                    autofocus
                    :placeholder="t('common.name')"
                    class="w-full"
                    :class="{ '!border-error': nameInvalid }"
                />
            </div>
            <div class="mt-0 flex flex-col">
                <small class="ml-2 mb-1 font-light text-sm">
                    {{ t('views.profiles.profileType') }}
                </small>
                <UiSelect
                    v-model="selectedTypeModel"
                    :options="profileTypeOptions"
                    :placeholder="t('views.profiles.profileType')"
                    class="w-full"
                />
            </div>
            <p>
                <span v-html="t('views.profiles.tooltip.profileType')" />
            </p>
        </div>
        <div class="flex flex-row justify-between mt-4">
            <UiButton variant="ghost" class="w-24 bg-bg-one" @click="emit('close')">
                {{ t('common.cancel') }}
            </UiButton>
            <UiButton
                variant="ghost"
                class="w-24 bg-bg-one"
                :disabled="nameInvalid"
                @click="nextStep"
            >
                {{ t('common.next') }}
            </UiButton>
        </div>
    </div>
</template>

<style scoped lang="scss"></style>
