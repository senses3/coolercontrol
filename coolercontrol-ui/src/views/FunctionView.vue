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
import { Function, FunctionType, getFunctionTypeDisplayName } from '@/models/Profile'
import { type UID } from '@/models/Device.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { computed, inject, nextTick, onMounted, onUnmounted, ref, type Ref, watch } from 'vue'
import { $enum } from 'ts-enum-util'
import { useToast } from 'primevue/usetoast'
import {
    mdiContentDuplicate,
    mdiContentSaveOutline,
    mdiDeleteOutline,
    mdiExportVariant,
} from '@mdi/js'
import { ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from 'reka-ui'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import UiButton from '@/shell/ui/UiButton.vue'
import UiListbox from '@/shell/ui/UiListbox.vue'
import UiNumberInput from '@/shell/ui/UiNumberInput.vue'
import { useToolWizards } from '@/composables/useToolWizards.ts'
import { useI18n } from 'vue-i18n'
import EntityTitleRename from '@/components/EntityTitleRename.vue'
import UiSwitch from '@/shell/ui/UiSwitch.vue'
import { Emitter, EventType } from 'mitt'

interface Props {
    functionUID: UID
}

const props = defineProps<Props>()
const emitter: Emitter<Record<EventType, any>> = inject('emitter')!
const settingsStore = useSettingsStore()
const deviceStore = useDeviceStore()
const toast = useToast()
const confirm = useConfirm()
const { t } = useI18n()

const contextIsDirty: Ref<boolean> = ref(false)

const dutyMin: number = 1
const dutyMax: number = 100
const windowSizeMin: number = 1
const windowSizeMax: number = 16
const devianceMin: number = 0
const devianceMax: number = 100
const delayMin: number = 0
const delayMax: number = 30

const currentFunction = computed(
    () => settingsStore.functions.find((fun) => fun.uid === props.functionUID)!,
)
let startingWindowSize = 8 // 8 is the recommended default
if (
    currentFunction.value.sample_window != null &&
    (currentFunction.value.sample_window > 0 || currentFunction.value.sample_window <= 16)
) {
    startingWindowSize = currentFunction.value.sample_window
}
let startingDelay = currentFunction.value.response_delay ?? 1
let startingDeviance = currentFunction.value.deviance ?? 2
let startingOnlyDownward = currentFunction.value.only_downward ?? false

const selectedType: Ref<FunctionType> = ref(currentFunction.value.f_type)
const chosenFixedStepSize: Ref<boolean> = ref(currentFunction.value.duty_maximum === 0)
const chosenAsymmetric: Ref<boolean> = ref(currentFunction.value.step_size_min_decreasing > 0)
const chosenStepDutyMinimum: Ref<number> = ref(currentFunction.value.duty_minimum)
const chosenStepDutyMaximum: Ref<number> = ref(currentFunction.value.duty_maximum)
const chosenStepSizeMinDecreasing: Ref<number> = ref(currentFunction.value.step_size_min_decreasing)
const chosenStepSizeMaxDecreasing: Ref<number> = ref(currentFunction.value.step_size_max_decreasing)
const chosenWindowSize: Ref<number> = ref(startingWindowSize)
const chosenDelay: Ref<number> = ref(startingDelay)
const chosenDeviance: Ref<number> = ref(startingDeviance)
const chosenOnlyDownward: Ref<boolean> = ref(startingOnlyDownward)
const chosenThresholdHopping: Ref<boolean> = ref(currentFunction.value.threshold_hopping)
const chosenBypassMinAtExtremes: Ref<boolean> = ref(currentFunction.value.bypass_min_at_extremes)
const functionTypeOptions = computed(() => {
    // EMA is deprecated in favor of the EMA custom-sensor type. Hide it unless this function
    // already uses it, so existing EMA functions stay editable but new adoption is discouraged.
    return [...$enum(FunctionType).values()]
        .filter(
            (type) =>
                type !== FunctionType.ExponentialMovingAvg ||
                currentFunction.value.f_type === FunctionType.ExponentialMovingAvg,
        )
        .map((type) => ({
            value: type,
            label: getFunctionTypeDisplayName(type),
        }))
})

const saveFunctionState = async () => {
    if (currentFunction.value.uid === '0') {
        console.error('Changing of the default Function is not allowed.')
        return
    }
    currentFunction.value.f_type = selectedType.value
    currentFunction.value.duty_minimum = chosenStepDutyMinimum.value
    currentFunction.value.duty_maximum = chosenStepDutyMaximum.value
    currentFunction.value.step_size_min_decreasing = chosenStepSizeMinDecreasing.value
    currentFunction.value.step_size_max_decreasing = chosenStepSizeMaxDecreasing.value
    if (!chosenAsymmetric.value) {
        // 0 = is symmetric and decreasing values don't apply
        currentFunction.value.step_size_min_decreasing = 0
        currentFunction.value.step_size_max_decreasing = 0
    }
    if (chosenFixedStepSize.value) {
        // 0 = is fixed and max values don't apply (only min is used)
        currentFunction.value.duty_maximum = 0
        currentFunction.value.step_size_max_decreasing = 0
    }
    currentFunction.value.sample_window =
        selectedType.value === FunctionType.ExponentialMovingAvg
            ? chosenWindowSize.value
            : undefined
    currentFunction.value.response_delay =
        selectedType.value === FunctionType.Standard ? chosenDelay.value : undefined
    currentFunction.value.deviance =
        selectedType.value === FunctionType.Standard ? chosenDeviance.value : undefined
    currentFunction.value.only_downward =
        selectedType.value === FunctionType.Standard ? chosenOnlyDownward.value : undefined
    currentFunction.value.threshold_hopping = chosenThresholdHopping.value
    currentFunction.value.bypass_min_at_extremes = chosenBypassMinAtExtremes.value
    const successful = await settingsStore.updateFunction(currentFunction.value.uid)
    if (successful) {
        contextIsDirty.value = false
        toast.add({
            severity: 'success',
            summary: t('common.success'),
            detail: t('views.functions.saveFunction'),
            life: 3000,
        })
    } else {
        toast.add({
            severity: 'error',
            summary: t('common.error'),
            detail: t('views.functions.functionError'),
            life: 3000,
        })
    }
}
const saveNameFunction = async (newName: string): Promise<boolean> => {
    if (newName.length > 0) {
        const oldName = currentFunction.value.name
        currentFunction.value.name = newName
        const successful = await settingsStore.updateFunction(currentFunction.value.uid)
        if (successful) {
            emitter.emit('function-name-update', {
                functionUID: currentFunction.value.uid,
                name: newName,
            })
            return true
        } else {
            currentFunction.value.name = oldName
            return false
        }
    }
    return false
}

const minDutyScrolled = (event: WheelEvent) => {
    if (event.deltaY < 0) {
        if (chosenStepDutyMinimum.value < chosenStepDutyMaximum.value)
            chosenStepDutyMinimum.value += 1
    } else {
        if (chosenStepDutyMinimum.value > dutyMin) chosenStepDutyMinimum.value -= 1
    }
}
const maxDutyScrolled = (event: WheelEvent) => {
    if (event.deltaY < 0) {
        if (chosenStepDutyMaximum.value < dutyMax) chosenStepDutyMaximum.value += 1
    } else {
        if (chosenStepDutyMaximum.value > chosenStepDutyMinimum.value)
            chosenStepDutyMaximum.value -= 1
    }
}
const stepMinDecreaseScrolled = (event: WheelEvent) => {
    if (event.deltaY < 0) {
        if (chosenStepSizeMinDecreasing.value < chosenStepSizeMaxDecreasing.value)
            chosenStepSizeMinDecreasing.value += 1
    } else {
        if (chosenStepSizeMinDecreasing.value > dutyMin) chosenStepSizeMinDecreasing.value -= 1
    }
}

const stepMaxDecreaseScrolled = (event: WheelEvent) => {
    if (event.deltaY < 0) {
        if (chosenStepSizeMaxDecreasing.value < dutyMax) chosenStepSizeMaxDecreasing.value += 1
    } else {
        if (chosenStepSizeMaxDecreasing.value > chosenStepSizeMinDecreasing.value)
            chosenStepSizeMaxDecreasing.value -= 1
    }
}
const windowSizeScrolled = (event: WheelEvent) => {
    if (event.deltaY < 0) {
        if (chosenWindowSize.value < windowSizeMax) chosenWindowSize.value += 1
    } else {
        if (chosenWindowSize.value > windowSizeMin) chosenWindowSize.value -= 1
    }
}
const devianceScrolled = (event: WheelEvent) => {
    if (event.deltaY < 0) {
        if (chosenDeviance.value < devianceMax) chosenDeviance.value += 0.1
    } else {
        if (chosenDeviance.value > devianceMin) chosenDeviance.value -= 0.1
    }
}
const delayScrolled = (event: WheelEvent) => {
    if (event.deltaY < 0) {
        if (chosenDelay.value < delayMax) chosenDelay.value += 1
    } else {
        if (chosenDelay.value > delayMin) chosenDelay.value -= 1
    }
}

const changeFunctionType = (value: string | undefined): void => {
    if (value == null) {
        return // do not update on unselect
    }
    selectedType.value = value as FunctionType
}

// const inputArea = ref()
// nextTick(async () => {
//     const delay = () => new Promise((resolve) => setTimeout(resolve, 100))
//     await delay()
//     inputArea.value.$el.focus()
// })

const updateFixedStepSize = () => {
    if (!chosenFixedStepSize.value) {
        if (chosenStepDutyMaximum.value < chosenStepDutyMinimum.value) {
            chosenStepDutyMaximum.value = chosenStepDutyMinimum.value
        }
        if (chosenStepSizeMaxDecreasing.value < chosenStepSizeMinDecreasing.value) {
            chosenStepSizeMaxDecreasing.value = chosenStepSizeMinDecreasing.value
        }
        nextTick(() => {
            removeScrollEventListeners()
            addScrollEventListeners()
        })
    }
}
const updateSymmetricStepSize = () => {
    if (chosenAsymmetric.value) {
        if (chosenStepDutyMaximum.value < chosenStepDutyMinimum.value) {
            chosenStepDutyMaximum.value = chosenStepDutyMinimum.value
        }
        if (chosenStepSizeMinDecreasing.value === 0) chosenStepSizeMinDecreasing.value = 2
        if (chosenStepSizeMaxDecreasing.value === 0) chosenStepSizeMaxDecreasing.value = dutyMax
        nextTick(() => {
            removeScrollEventListeners()
            addScrollEventListeners()
        })
    }
}

const addScrollEventListeners = (): void => {
    // @ts-ignore
    document?.querySelector('.min-duty-input')?.addEventListener('wheel', minDutyScrolled)
    // @ts-ignore
    document?.querySelector('.max-duty-input')?.addEventListener('wheel', maxDutyScrolled)
    document
        ?.querySelector('.step-min-decrease-input')
        // @ts-ignore
        ?.addEventListener('wheel', stepMinDecreaseScrolled)
    document
        ?.querySelector('.step-max-decrease-input')
        // @ts-ignore
        ?.addEventListener('wheel', stepMaxDecreaseScrolled)
    // @ts-ignore
    document?.querySelector('.window-size-input')?.addEventListener('wheel', windowSizeScrolled)
    // @ts-ignore
    document?.querySelector('.deviance-input')?.addEventListener('wheel', devianceScrolled)
    // @ts-ignore
    document?.querySelector('.delay-input')?.addEventListener('wheel', delayScrolled)
}

const removeScrollEventListeners = (): void => {
    // @ts-ignore
    document?.querySelector('.min-duty-input')?.removeEventListener('wheel', minDutyScrolled)
    // @ts-ignore
    document?.querySelector('.max-duty-input')?.removeEventListener('wheel', maxDutyScrolled)
    document
        ?.querySelector('.step-min-decrease-input')
        // @ts-ignore
        ?.removeEventListener('wheel', stepMinDecreaseScrolled)
    document
        ?.querySelector('.step-max-decrease-input')
        // @ts-ignore
        ?.removeEventListener('wheel', stepMaxDecreaseScrolled)
    // @ts-ignore
    document?.querySelector('.window-size-input')?.removeEventListener('wheel', windowSizeScrolled)
    // @ts-ignore
    document?.querySelector('.deviance-input')?.removeEventListener('wheel', devianceScrolled)
    // @ts-ignore
    document?.querySelector('.delay-input')?.removeEventListener('wheel', delayScrolled)
}

const checkForUnsavedChanges = (): boolean | Promise<boolean> => {
    if (!contextIsDirty.value) {
        return true
    }
    return new Promise<boolean>((resolve) => {
        confirm.require({
            message: t('views.functions.unsavedChanges'),
            header: t('views.functions.unsavedChangesHeader'),
            icon: 'pi pi-exclamation-triangle',
            defaultFocus: 'accept',
            rejectLabel: t('common.stay'),
            acceptLabel: t('common.discard'),
            accept: () => {
                contextIsDirty.value = false
                resolve(true)
            },
            reject: () => resolve(false),
        })
    })
}

const router = useRouter()

const duplicateFunction = async (): Promise<void> => {
    const source = currentFunction.value
    const newFunction = new Function(
        `${source.name} ${t('common.copy')}`,
        source.f_type,
        source.duty_minimum,
        source.duty_maximum,
        source.response_delay,
        source.deviance,
        source.only_downward,
        source.sample_window,
    )
    settingsStore.functions.push(newFunction)
    await settingsStore.saveFunction(newFunction.uid)
    toast.add({
        severity: 'success',
        summary: t('common.success'),
        detail: t('views.functions.functionDuplicated'),
        life: 3000,
    })
    await router.push({ name: 'functions', params: { functionUID: newFunction.uid } })
}

const deleteFunction = (): void => {
    if (currentFunction.value.uid === '0') return // can't delete default
    const associatedProfiles = settingsStore.profiles.filter(
        (p) => p.function_uid === currentFunction.value.uid,
    )
    const deleteMessage: string =
        associatedProfiles.length === 0
            ? t('views.functions.deleteFunctionConfirm', { name: currentFunction.value.name })
            : t('views.functions.deleteFunctionWithProfilesConfirm', {
                  name: currentFunction.value.name,
                  profiles: associatedProfiles.map((p) => p.name).join(', '),
              })
    confirm.require({
        message: deleteMessage,
        header: t('views.functions.deleteFunction'),
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            contextIsDirty.value = false
            const functionIndex = settingsStore.functions.findIndex(
                (fun) => fun.uid === currentFunction.value.uid,
            )
            await settingsStore.deleteFunction(currentFunction.value.uid)
            if (functionIndex !== -1) settingsStore.functions.splice(functionIndex, 1)
            toast.add({
                severity: 'success',
                summary: t('common.success'),
                detail: t('views.functions.functionDeleted'),
                life: 3000,
            })
            await router.push({ name: 'section-cooling' })
        },
    })
}

const { openFunctionApplyWizard } = useToolWizards()

// Profiles currently using this function (where-used).
const usedByProfiles = computed((): string[] =>
    settingsStore.profiles
        .filter((profile) => profile.function_uid === currentFunction.value.uid)
        .map((profile) => profile.name),
)

onMounted(async () => {
    addScrollEventListeners()
    // re-add some scroll event listeners for elements that are rendered on Type change
    watch(selectedType, () => {
        nextTick(addScrollEventListeners)
    })
    watch(
        [
            selectedType,
            chosenFixedStepSize,
            chosenAsymmetric,
            chosenStepDutyMinimum,
            chosenStepDutyMaximum,
            chosenStepSizeMinDecreasing,
            chosenStepSizeMaxDecreasing,
            chosenWindowSize,
            chosenDeviance,
            chosenDelay,
            chosenOnlyDownward,
            chosenThresholdHopping,
            chosenBypassMinAtExtremes,
        ],
        () => {
            contextIsDirty.value = true
        },
    )
    onBeforeRouteUpdate(checkForUnsavedChanges)
    onBeforeRouteLeave(checkForUnsavedChanges)
})
onUnmounted(() => {
    removeScrollEventListeners()
})
</script>

<template>
    <div class="flex flex-wrap border-b-4 border-border-one items-center justify-between">
        <entity-title-rename
            :current-name="currentFunction.name"
            :save-name-function="saveNameFunction"
        />
        <div class="flex flex-wrap gap-x-1 justify-end">
            <div
                class="p-2 flex leading-none items-center cursor-pointer"
                v-tooltip.top="t('components.wizards.functionApply.applyFunction')"
                @click="openFunctionApplyWizard(currentFunction.uid)"
            >
                <svg-icon
                    type="mdi"
                    :path="mdiExportVariant"
                    :size="deviceStore.getREMSize(1.25)"
                />
            </div>
            <div
                class="p-2 flex leading-none items-center cursor-pointer"
                v-tooltip.top="t('layout.menu.tooltips.duplicate')"
                @click="duplicateFunction"
            >
                <svg-icon
                    type="mdi"
                    :path="mdiContentDuplicate"
                    :size="deviceStore.getREMSize(1.25)"
                />
            </div>
            <div
                v-if="currentFunction.uid !== '0'"
                class="p-2 flex leading-none items-center cursor-pointer"
                v-tooltip.top="t('views.functions.deleteFunction')"
                @click="deleteFunction"
            >
                <svg-icon
                    type="mdi"
                    :path="mdiDeleteOutline"
                    :size="deviceStore.getREMSize(1.25)"
                />
            </div>
            <div class="p-2">
                <UiButton
                    class="w-32"
                    :class="{ 'animate-pulse-fast': contextIsDirty }"
                    v-tooltip.top="t('views.functions.saveFunction')"
                    @click="saveFunctionState"
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
        <div
            v-if="usedByProfiles.length > 0"
            class="w-full mx-4 mb-2 text-sm text-text-color-secondary"
        >
            {{ t('views.functions.usedBy') }}: {{ usedByProfiles.join(', ') }}
        </div>
    </div>
    <ScrollAreaRoot style="--scrollbar-size: 10px">
        <ScrollAreaViewport class="p-4 pb-16 h-screen w-full">
            <div class="mt-0 mr-4 w-96">
                <small class="ml-3 font-light text-sm text-text-color-secondary">
                    {{ t('views.functions.functionType') }}
                </small>
                <UiListbox
                    :model-value="selectedType"
                    :options="functionTypeOptions"
                    class="w-full"
                    v-tooltip.top="{
                        escape: false,
                        value:
                            t('views.functions.functionTypeTooltip') +
                            '<br/>&nbsp;&nbsp;' +
                            t('views.functions.emaCustomSensorAvailableNote'),
                    }"
                    @update:model-value="changeFunctionType"
                />
            </div>
            <!--
                EMA migration placeholder. Stage 1 (informational) is delivered via the
                Function Type tooltip above (`emaCustomSensorAvailableNote` appended).
                Stage 2 (active deprecation): set the `v-if` below to
                `selectedType === FunctionType.ExponentialMovingAvg` and drop the
                appended note from the tooltip.
            -->
            <div
                v-if="false"
                class="mt-3 mr-4 w-96 rounded-lg border-2 border-accent bg-bg-two p-3 text-sm"
            >
                {{ t('views.functions.emaDeprecatedWarning') }}
            </div>
            <table class="mt-4 bg-bg-two rounded-lg">
                <tbody>
                    <tr>
                        <th
                            colspan="2"
                            class="pt-4 pb-2 px-4 w-48 text-center items-center border-border-one border-b-2"
                        >
                            {{ t('views.functions.stepSizeTitle') }}
                        </th>
                    </tr>
                    <tr v-tooltip.top="t('views.functions.fixedStepSizeTooltip')">
                        <td
                            class="py-4 px-4 w-48 text-right items-center border-border-one border-r-2 border-t-2"
                        >
                            {{ t('views.functions.fixedStepSize') }}
                        </td>
                        <td
                            class="py-2 px-2 w-48 text-center items-center border-border-one border-l-2 border-t-2"
                        >
                            <UiSwitch
                                v-model="chosenFixedStepSize"
                                @update:model-value="updateFixedStepSize"
                            />
                        </td>
                    </tr>
                    <tr v-tooltip.top="t('views.functions.asymmetricTooltip')">
                        <td
                            class="py-4 px-4 w-48 text-right items-center border-border-one border-r-2 border-t"
                        >
                            {{ t('views.functions.asymmetric') }}
                        </td>
                        <td
                            class="py-2 px-2 w-48 text-center items-center border-border-one border-l-2 border-t"
                        >
                            <UiSwitch
                                v-model="chosenAsymmetric"
                                @update:model-value="updateSymmetricStepSize"
                            />
                        </td>
                    </tr>
                    <tr
                        v-tooltip.top="
                            chosenFixedStepSize
                                ? chosenAsymmetric
                                    ? t('views.functions.stepSizeFixedIncreasingTooltip')
                                    : t('views.functions.stepSizeFixedTooltip')
                                : chosenAsymmetric
                                  ? t('views.functions.stepSizeMinIncreasingTooltip')
                                  : t('views.functions.stepSizeMinTooltip')
                        "
                    >
                        <td
                            class="py-4 px-4 w-48 text-right items-center border-border-one border-r-2 border-t"
                        >
                            {{
                                chosenFixedStepSize
                                    ? chosenAsymmetric
                                        ? t('views.functions.stepSizeFixedIncreasing')
                                        : t('views.functions.stepSizeFixed')
                                    : chosenAsymmetric
                                      ? t('views.functions.stepSizeMinIncreasing')
                                      : t('views.functions.stepSizeMin')
                            }}
                        </td>
                        <td
                            class="py-4 px-2 w-48 text-center items-center border-border-one border-l-2 border-t"
                        >
                            <UiNumberInput
                                v-model="chosenStepDutyMinimum"
                                :min="dutyMin"
                                :max="chosenFixedStepSize ? dutyMax : chosenStepDutyMaximum"
                                :suffix="t('common.percentUnit')"
                            />
                        </td>
                    </tr>
                    <tr
                        v-if="!chosenFixedStepSize"
                        v-tooltip.top="
                            chosenAsymmetric
                                ? t('views.functions.stepSizeMaxIncreasingTooltip')
                                : t('views.functions.stepSizeMaxTooltip')
                        "
                    >
                        <td
                            class="py-4 px-4 w-48 text-right items-center border-border-one border-r-2 border-t"
                        >
                            {{
                                chosenAsymmetric
                                    ? t('views.functions.stepSizeMaxIncreasing')
                                    : t('views.functions.stepSizeMax')
                            }}
                        </td>
                        <td
                            class="py-4 px-2 w-48 text-center items-center border-border-one border-l-2 border-t"
                        >
                            <UiNumberInput
                                v-model="chosenStepDutyMaximum"
                                :min="chosenStepDutyMinimum"
                                :max="dutyMax"
                                :suffix="t('common.percentUnit')"
                            />
                        </td>
                    </tr>
                    <tr
                        v-if="chosenAsymmetric"
                        v-tooltip.top="
                            chosenFixedStepSize
                                ? t('views.functions.stepSizeFixedDecreasingTooltip')
                                : t('views.functions.stepSizeMinDecreasingTooltip')
                        "
                    >
                        <td
                            class="py-4 px-4 w-48 text-right items-center border-border-one border-r-2 border-t"
                        >
                            {{
                                chosenFixedStepSize
                                    ? t('views.functions.stepSizeFixedDecreasing')
                                    : t('views.functions.stepSizeMinDecreasing')
                            }}
                        </td>
                        <td
                            class="py-4 px-2 w-48 text-center items-center border-border-one border-l-2 border-t"
                        >
                            <UiNumberInput
                                v-model="chosenStepSizeMinDecreasing"
                                :min="dutyMin"
                                :max="chosenFixedStepSize ? dutyMax : chosenStepSizeMaxDecreasing"
                                :suffix="t('common.percentUnit')"
                            />
                        </td>
                    </tr>
                    <tr
                        v-if="chosenAsymmetric && !chosenFixedStepSize"
                        v-tooltip.top="t('views.functions.stepSizeMaxDecreasingTooltip')"
                    >
                        <td
                            class="py-4 px-4 w-48 text-right items-center border-border-one border-r-2 border-t"
                        >
                            {{ t('views.functions.stepSizeMaxDecreasing') }}
                        </td>
                        <td
                            class="py-4 px-2 w-48 text-center items-center border-border-one border-l-2 border-t"
                        >
                            <UiNumberInput
                                v-model="chosenStepSizeMaxDecreasing"
                                :min="Math.max(dutyMin, chosenStepSizeMinDecreasing)"
                                :max="dutyMax"
                                :suffix="t('common.percentUnit')"
                            />
                        </td>
                    </tr>
                    <tr>
                        <th
                            colspan="2"
                            class="pt-4 pb-2 px-4 w-48 text-center items-center border-border-one border-t-2"
                        >
                            {{ t('views.functions.stepOverrides') }}
                        </th>
                    </tr>
                    <tr v-tooltip.top="t('views.functions.thresholdHoppingTooltip')">
                        <td
                            class="py-4 px-4 w-48 text-right items-center border-border-one border-r-2 border-t-2"
                        >
                            {{ t('views.functions.thresholdHopping') }}
                        </td>
                        <td
                            class="py-4 px-2 w-48 text-center items-center border-border-one border-l-2 border-t-2"
                        >
                            <UiSwitch v-model="chosenThresholdHopping" />
                        </td>
                    </tr>
                    <tr v-tooltip.top="t('views.functions.bypassMinAtExtremesTooltip')">
                        <td
                            class="py-4 px-4 w-48 text-right items-center border-border-one border-r-2 border-t"
                        >
                            {{ t('views.functions.bypassMinAtExtremes') }}
                        </td>
                        <td
                            class="py-4 px-2 w-48 text-center items-center border-border-one border-l-2 border-t"
                        >
                            <UiSwitch v-model="chosenBypassMinAtExtremes" />
                        </td>
                    </tr>
                    <tr v-if="selectedType === FunctionType.Standard">
                        <th
                            colspan="2"
                            class="pt-4 pb-2 px-4 w-48 text-center items-center border-border-one border-t-2"
                        >
                            {{ t('views.functions.hysteresis') }}
                        </th>
                    </tr>
                    <tr
                        v-if="selectedType === FunctionType.Standard"
                        v-tooltip.top="t('views.functions.hysteresisThresholdTooltip')"
                    >
                        <td
                            class="py-4 px-4 w-48 text-right items-center border-border-one border-r-2 border-t-2"
                        >
                            {{ t('views.functions.hysteresisThreshold') }}
                        </td>
                        <td
                            class="py-4 px-2 w-48 text-center items-center border-border-one border-l-2 border-t-2"
                        >
                            <UiNumberInput
                                v-model="chosenDeviance"
                                :min="devianceMin"
                                :max="devianceMax"
                                :step="0.1"
                                :suffix="t('common.tempUnit')"
                            />
                        </td>
                    </tr>
                    <tr
                        v-if="selectedType === FunctionType.Standard"
                        v-tooltip.top="t('views.functions.hysteresisDelayTooltip')"
                    >
                        <td
                            class="py-4 px-4 w-48 text-right items-center border-border-one border-r-2 border-t"
                        >
                            {{ t('views.functions.hysteresisDelay') }}
                        </td>
                        <td
                            class="py-4 px-2 w-48 text-center items-center border-border-one border-l-2 border-t"
                        >
                            <UiNumberInput
                                v-model="chosenDelay"
                                :min="delayMin"
                                :max="delayMax"
                                :suffix="t('common.secondAbbr')"
                            />
                        </td>
                    </tr>
                    <tr
                        v-if="selectedType === FunctionType.Standard"
                        v-tooltip.top="t('views.functions.onlyDownwardTooltip')"
                    >
                        <td
                            class="py-4 px-4 w-48 text-right items-center border-border-one border-r-2 border-t"
                        >
                            {{ t('views.functions.onlyDownward') }}
                        </td>
                        <td
                            class="py-2 px-2 w-48 text-center items-center border-border-one border-l-2 border-t"
                        >
                            <UiSwitch v-model="chosenOnlyDownward" />
                        </td>
                    </tr>
                    <tr v-if="selectedType === FunctionType.ExponentialMovingAvg">
                        <th
                            colspan="2"
                            class="pt-4 pb-2 px-4 w-48 text-center items-center border-border-one border-t-2"
                        >
                            {{ t('views.functions.general') }}
                        </th>
                    </tr>
                    <tr
                        v-if="selectedType === FunctionType.ExponentialMovingAvg"
                        v-tooltip.top="t('views.functions.windowSizeTooltip')"
                    >
                        <td
                            class="py-4 px-4 w-48 text-right items-center border-border-one border-r-2 border-t-2"
                        >
                            {{ t('views.functions.windowSize') }}
                        </td>
                        <td
                            class="py-4 px-2 w-48 text-center items-center border-border-one border-l-2 border-t-2"
                        >
                            <UiNumberInput
                                v-model="chosenWindowSize"
                                :min="windowSizeMin"
                                :max="windowSizeMax"
                            />
                        </td>
                    </tr>
                </tbody>
            </table>
        </ScrollAreaViewport>
        <ScrollAreaScrollbar
            class="flex select-none touch-none p-0.5 bg-transparent transition-colors duration-[120ms] ease-out data-[orientation=vertical]:w-2.5"
            orientation="vertical"
        >
            <ScrollAreaThumb
                class="flex-1 bg-border-one opacity-80 rounded-lg relative before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:w-full before:h-full before:min-w-[44px] before:min-h-[44px]"
            />
        </ScrollAreaScrollbar>
    </ScrollAreaRoot>
</template>

<style scoped lang="scss"></style>
