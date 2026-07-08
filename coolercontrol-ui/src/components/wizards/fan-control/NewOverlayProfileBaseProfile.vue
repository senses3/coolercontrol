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
import UiButton from '@/shell/ui/UiButton.vue'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import UiSelect from '@/shell/ui/UiSelect.vue'
import { computed, ref, Ref } from 'vue'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { Profile, ProfileType } from '@/models/Profile.ts'
import { UID } from '@/models/Device.ts'
import UiNumberInput from '@/shell/ui/UiNumberInput.vue'
import UiSlider from '@/shell/ui/UiSlider.vue'

interface Props {
    name: string
    memberIds: Array<UID>
    offsetProfile: Array<[number, number]>
}

const props = defineProps<Props>()
const emit = defineEmits<{
    (e: 'nextStep', step: number): void
    (e: 'memberIds', memberIds: Array<UID>): void
    (e: 'offsetProfile', offsetProfile: Array<[number, number]>): void
}>()

const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()

const offsetMemberProfileOptions: Ref<Array<Profile>> = computed(() =>
    settingsStore.profiles.filter(
        (profile) => profile.p_type === ProfileType.Graph || profile.p_type === ProfileType.Mix,
    ),
)
const chosenOverlayMemberProfile: Ref<Profile | undefined> = ref(
    props.memberIds.length != 1
        ? undefined
        : settingsStore.profiles.find((profile) => profile.uid === props.memberIds[0]),
)
const chosenOverlayOffsetType: Ref<string> = ref(
    props.offsetProfile == null || props.offsetProfile.length < 2 ? 'static' : 'graph',
)
const overlayOffsetTypeOptions: Array<{ value: string; label: string }> = [
    {
        value: 'static',
        label: t('views.profiles.offsetTypeStatic'),
    },
    {
        value: 'graph',
        label: t('views.profiles.offsetTypeGraph'),
    },
]
const selectedStaticOffset: Ref<number> = ref(0)
const offsetMin: number = -100
const offsetMax: number = 100
const staticOffsetPrefix = computed(() =>
    selectedStaticOffset.value != null && selectedStaticOffset.value > 0 ? '+' : '',
)
const chosenOverlayMemberProfileUid = computed<string | undefined>({
    get: () => chosenOverlayMemberProfile.value?.uid,
    set: (uid) => {
        chosenOverlayMemberProfile.value = offsetMemberProfileOptions.value.find(
            (p) => p.uid === uid,
        )
    },
})
const overlayBaseOptions = computed(() =>
    offsetMemberProfileOptions.value.map((p) => ({ label: p.name, value: p.uid })),
)
const nextStep = () => {
    if (chosenOverlayMemberProfile.value == null) {
        return
    }
    emit('memberIds', [chosenOverlayMemberProfile.value!.uid])
    if (chosenOverlayOffsetType.value === 'static') {
        emit('offsetProfile', [[50, selectedStaticOffset.value ?? 0]])
    }
    const nextStep = chosenOverlayOffsetType.value === 'graph' ? 101 : 13
    emit('nextStep', nextStep)
}
</script>

<template>
    <div class="flex flex-col justify-between min-w-96 w-[40vw] min-h-max h-[40vh]">
        <div class="flex flex-col gap-y-4">
            <div class="w-full mb-2">
                {{ t('components.wizards.fanControl.newOverlayProfile') }}:
                <span class="font-bold">{{ props.name }}</span>
                <br />
                {{ t('components.wizards.fanControl.withSettings') }}:
            </div>
            <div class="mt-0 flex flex-col" v-tooltip.top="t('views.profiles.baseProfile')">
                <small class="ml-2 mb-1 font-light text-sm">
                    {{ t('views.profiles.baseProfile') }}
                </small>
                <UiSelect
                    v-model="chosenOverlayMemberProfileUid"
                    :options="overlayBaseOptions"
                    :placeholder="t('views.profiles.baseProfile')"
                    :invalid="chosenOverlayMemberProfile == null"
                    class="w-full"
                />
            </div>
            <div class="mt-0 flex flex-col" v-tooltip.top="t('views.profiles.offsetType')">
                <small class="ml-2 mb-1 font-light text-sm">
                    {{ t('views.profiles.offsetType') }}
                </small>
                <UiSelect
                    v-model="chosenOverlayOffsetType"
                    :options="overlayOffsetTypeOptions"
                    :placeholder="t('views.profiles.offsetType')"
                    class="w-full"
                />
            </div>
            <div class="mt-0 flex flex-col" v-if="chosenOverlayOffsetType === 'static'">
                <small class="ml-2 mb-1 font-light text-sm">
                    {{ t('views.profiles.staticOffset') }}
                </small>
                <UiNumberInput
                    v-model="selectedStaticOffset"
                    :prefix="staticOffsetPrefix"
                    :suffix="` ${t('common.percentUnit')}`"
                    :min="offsetMin"
                    :max="offsetMax"
                    :step="1"
                    :disabled="chosenOverlayMemberProfile == null"
                />
                <div class="mx-1.5 mt-0">
                    <UiSlider
                        v-model="selectedStaticOffset"
                        :step="1"
                        :min="offsetMin"
                        :max="offsetMax"
                        :disabled="chosenOverlayMemberProfile == null"
                    />
                </div>
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
                variant="ghost"
                class="w-24 bg-bg-one"
                :disabled="chosenOverlayMemberProfile == null"
                @click="nextStep"
            >
                {{ t('common.next') }}
            </UiButton>
        </div>
    </div>
</template>

<style scoped lang="scss"></style>
