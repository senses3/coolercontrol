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
import { Function, FunctionType, getFunctionTypeDisplayName } from '@/models/Profile.ts'
import { useI18n } from 'vue-i18n'
import { DEFAULT_NAME_STRING_LENGTH, useDeviceStore } from '@/stores/DeviceStore.ts'
import UiSwitch from '@/shell/ui/UiSwitch.vue'
import { computed, ref, type Ref } from 'vue'
import UiInput from '@/shell/ui/UiInput.vue'
import UiSelect from '@/shell/ui/UiSelect.vue'
import { $enum } from 'ts-enum-util'
import UiNumberInput from '@/shell/ui/UiNumberInput.vue'

interface Props {
    profileName?: string
    functionName?: string
    newFunction?: Function
}

const props = defineProps<Props>()
const emit = defineEmits<{
    (e: 'nextStep', step: number): void
    (e: 'newFunction', fun: Function): void
    (e: 'close'): void
}>()

const { t } = useI18n()
const deviceStore = useDeviceStore()

const dutyMin: number = 1
const dutyMax: number = 100
const devianceMin: number = 0
const devianceMax: number = 100
const delayMin: number = 0
const delayMax: number = 30

const newFunction =
    props.newFunction === undefined
        ? new Function(
              props.profileName !== undefined
                  ? t('components.wizards.fanControl.newFunctionName', {
                        profileName: props.profileName,
                    })
                  : (props.functionName ?? ''),
              FunctionType.Standard,
          )
        : props.newFunction
const currentFunction: Ref<Function> = ref(newFunction)

let startingDelay = currentFunction.value.response_delay ?? 1
let startingDeviance = currentFunction.value.deviance ?? 2
let startingOnlyDownward = currentFunction.value.only_downward ?? false

const selectedType: Ref<FunctionType> = ref(newFunction.f_type)
const selectedTypeModel = computed<string | undefined>({
    get: () => selectedType.value,
    set: (value) => {
        if (value != null) selectedType.value = value as FunctionType
    },
})
const functionTypeOptions = computed(() =>
    [...$enum(FunctionType).values()].map((type) => ({
        value: type,
        label: getFunctionTypeDisplayName(type),
    })),
)
const nameInput: Ref<string> = ref(newFunction.name)
const nameInvalid = computed(() => {
    return nameInput.value.length < 1 || nameInput.value.length > DEFAULT_NAME_STRING_LENGTH
})
const chosenFixedStepSize: Ref<boolean> = ref(currentFunction.value.duty_maximum === 0)
const chosenAsymmetric: Ref<boolean> = ref(currentFunction.value.step_size_min_decreasing > 0)
const chosenStepDutyMinimum: Ref<number> = ref(currentFunction.value.duty_minimum)
const chosenStepDutyMaximum: Ref<number> = ref(currentFunction.value.duty_maximum)
const chosenStepSizeMinDecreasing: Ref<number> = ref(currentFunction.value.step_size_min_decreasing)
const chosenStepSizeMaxDecreasing: Ref<number> = ref(currentFunction.value.step_size_max_decreasing)
const chosenDelay: Ref<number> = ref(startingDelay)
const chosenDeviance: Ref<number> = ref(startingDeviance)
const chosenOnlyDownward: Ref<boolean> = ref(startingOnlyDownward)
const chosenThresholdHopping: Ref<boolean> = ref(currentFunction.value.threshold_hopping)
const chosenBypassMinAtExtremes: Ref<boolean> = ref(currentFunction.value.bypass_min_at_extremes)

const nextStep = async (): Promise<void> => {
    if (currentFunction.value.uid === '0') {
        console.error('Changing of the default Function is not allowed.')
        return
    }
    currentFunction.value.name = nameInput.value
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
    currentFunction.value.response_delay =
        selectedType.value === FunctionType.Standard ? chosenDelay.value : undefined
    currentFunction.value.deviance =
        selectedType.value === FunctionType.Standard ? chosenDeviance.value : undefined
    currentFunction.value.only_downward =
        selectedType.value === FunctionType.Standard ? chosenOnlyDownward.value : undefined
    currentFunction.value.threshold_hopping = chosenThresholdHopping.value
    currentFunction.value.bypass_min_at_extremes = chosenBypassMinAtExtremes.value

    emit('newFunction', currentFunction.value)
    emit('nextStep', 13)
}

const updateFixedStepSize = () => {
    if (!chosenFixedStepSize.value) {
        if (chosenStepDutyMaximum.value < chosenStepDutyMinimum.value) {
            chosenStepDutyMaximum.value = chosenStepDutyMinimum.value
        }
        if (chosenStepSizeMaxDecreasing.value < chosenStepSizeMinDecreasing.value) {
            chosenStepSizeMaxDecreasing.value = chosenStepSizeMinDecreasing.value
        }
    }
}
const updateSymmetricStepSize = () => {
    if (chosenAsymmetric.value) {
        if (chosenStepDutyMaximum.value < chosenStepDutyMinimum.value) {
            chosenStepDutyMaximum.value = chosenStepDutyMinimum.value
        }
        if (chosenStepSizeMinDecreasing.value === 0) chosenStepSizeMinDecreasing.value = 2
        if (chosenStepSizeMaxDecreasing.value === 0) chosenStepSizeMaxDecreasing.value = dutyMax
    }
}
</script>

<template>
    <div class="flex flex-col justify-between min-w-96 w-[40vw] min-h-max h-[40vh]">
        <div class="flex flex-col gap-y-4">
            <div class="w-full">
                {{ t('components.wizards.fanControl.chooseFunctionNameType') }}:
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
                    {{ t('views.functions.functionType') }}
                </small>
                <UiSelect
                    v-model="selectedTypeModel"
                    :options="functionTypeOptions"
                    :placeholder="t('views.functions.functionType')"
                    class="w-full"
                />
            </div>
            <p>
                <span v-html="t('views.functions.functionTypeTooltip')" />
            </p>
            <div class="pr-1 w-full border-border-one border-2 rounded-lg">
                <table class="m-0.5 w-full bg-bg-two">
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
                                class="py-4 px-4 w-px whitespace-nowrap text-right items-center border-border-one border-r-2 border-b"
                            >
                                {{ t('views.functions.fixedStepSize') }}
                            </td>
                            <td
                                class="py-0 px-2 text-center items-center border-border-one border-l-2 border-b"
                            >
                                <UiSwitch
                                    v-model="chosenFixedStepSize"
                                    @update:model-value="updateFixedStepSize"
                                />
                            </td>
                        </tr>
                        <tr v-tooltip.top="t('views.functions.asymmetricTooltip')">
                            <td
                                class="py-4 px-4 w-px whitespace-nowrap text-right items-center border-border-one border-r-2 border-b"
                            >
                                {{ t('views.functions.asymmetric') }}
                            </td>
                            <td
                                class="py-0 px-2 text-center items-center border-border-one border-l-2 border-b"
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
                                class="py-4 px-4 w-px whitespace-nowrap text-right items-center border-border-one border-r-2 border-b"
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
                                class="py-0 px-2 text-center items-center border-border-one border-l-2 border-b"
                            >
                                <UiNumberInput
                                    v-model="chosenStepDutyMinimum"
                                    :min="dutyMin"
                                    :max="chosenFixedStepSize ? dutyMax : chosenStepDutyMaximum"
                                    :suffix="` ${t('common.percentUnit')}`"
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
                                class="py-4 px-4 w-px whitespace-nowrap text-right items-center border-border-one border-r-2 border-b"
                            >
                                {{
                                    chosenAsymmetric
                                        ? t('views.functions.stepSizeMaxIncreasing')
                                        : t('views.functions.stepSizeMax')
                                }}
                            </td>
                            <td
                                class="py-0 px-2 text-center items-center border-border-one border-l-2 border-b"
                            >
                                <UiNumberInput
                                    v-model="chosenStepDutyMaximum"
                                    :min="chosenStepDutyMinimum"
                                    :max="dutyMax"
                                    :suffix="` ${t('common.percentUnit')}`"
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
                                class="py-4 px-4 w-px whitespace-nowrap text-right items-center border-border-one border-r-2 border-b"
                            >
                                {{
                                    chosenFixedStepSize
                                        ? t('views.functions.stepSizeFixedDecreasing')
                                        : t('views.functions.stepSizeMinDecreasing')
                                }}
                            </td>
                            <td
                                class="py-0 px-2 text-center items-center border-border-one border-l-2 border-b"
                            >
                                <UiNumberInput
                                    v-model="chosenStepSizeMinDecreasing"
                                    :min="dutyMin"
                                    :max="
                                        chosenFixedStepSize ? dutyMax : chosenStepSizeMaxDecreasing
                                    "
                                    :suffix="` ${t('common.percentUnit')}`"
                                />
                            </td>
                        </tr>
                        <tr
                            v-if="chosenAsymmetric && !chosenFixedStepSize"
                            v-tooltip.top="t('views.functions.stepSizeMaxDecreasingTooltip')"
                        >
                            <td
                                class="py-4 px-4 w-px whitespace-nowrap text-right items-center border-border-one border-r-2 border-t"
                            >
                                {{ t('views.functions.stepSizeMaxDecreasing') }}
                            </td>
                            <td
                                class="py-0 px-2 text-center items-center border-border-one border-l-2 border-t"
                            >
                                <UiNumberInput
                                    v-model="chosenStepSizeMaxDecreasing"
                                    :min="Math.max(dutyMin, chosenStepSizeMinDecreasing)"
                                    :max="dutyMax"
                                    :suffix="` ${t('common.percentUnit')}`"
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
                                class="py-4 px-4 w-px whitespace-nowrap text-right items-center border-border-one border-r-2 border-t-2"
                            >
                                {{ t('views.functions.thresholdHopping') }}
                            </td>
                            <td
                                class="py-0 px-2 text-center items-center border-border-one border-l-2 border-t-2"
                            >
                                <UiSwitch v-model="chosenThresholdHopping" />
                            </td>
                        </tr>
                        <tr v-tooltip.top="t('views.functions.bypassMinAtExtremesTooltip')">
                            <td
                                class="py-4 px-4 w-px whitespace-nowrap text-right items-center border-border-one border-r-2 border-t"
                            >
                                {{ t('views.functions.bypassMinAtExtremes') }}
                            </td>
                            <td
                                class="py-0 px-2 text-center items-center border-border-one border-l-2 border-t"
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
                                class="py-4 px-4 w-px whitespace-nowrap text-right items-center border-border-one border-r-2 border-t-2"
                            >
                                {{ t('views.functions.hysteresisThreshold') }}
                            </td>
                            <td
                                class="py-0 px-2 text-center items-center border-border-one border-l-2 border-t-2"
                            >
                                <UiNumberInput
                                    v-model="chosenDeviance"
                                    :suffix="` ${t('common.tempUnit')}`"
                                    :step="0.1"
                                    :min="devianceMin"
                                    :max="devianceMax"
                                />
                            </td>
                        </tr>
                        <tr
                            v-if="selectedType === FunctionType.Standard"
                            v-tooltip.top="t('views.functions.hysteresisDelayTooltip')"
                        >
                            <td
                                class="py-4 px-4 w-px whitespace-nowrap text-right items-center border-border-one border-r-2 border-t"
                            >
                                {{ t('views.functions.hysteresisDelay') }}
                            </td>
                            <td
                                class="py-0 px-2 text-center items-center border-border-one border-l-2 border-t"
                            >
                                <UiNumberInput
                                    v-model="chosenDelay"
                                    :suffix="` ${t('common.secondAbbr')}`"
                                    :min="delayMin"
                                    :max="delayMax"
                                />
                            </td>
                        </tr>
                        <tr
                            v-if="selectedType === FunctionType.Standard"
                            v-tooltip.top="t('views.functions.onlyDownwardTooltip')"
                        >
                            <td
                                class="py-4 px-4 w-px whitespace-nowrap text-right items-center border-border-one border-r-2 border-t"
                            >
                                {{ t('views.functions.onlyDownward') }}
                            </td>
                            <td
                                class="py-0 px-2 text-center items-center border-border-one border-l-2 border-t"
                            >
                                <UiSwitch v-model="chosenOnlyDownward" />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        <div class="flex flex-row justify-between mt-4">
            <UiButton
                v-if="props.profileName === undefined"
                variant="ghost"
                class="w-24 bg-bg-one"
                @click="emit('close')"
            >
                {{ t('common.cancel') }}
            </UiButton>
            <UiButton v-else variant="ghost" class="w-24 bg-bg-one" @click="emit('nextStep', 10)">
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
                :disabled="currentFunction == null || nameInvalid"
                @click="nextStep"
            >
                {{ t('common.next') }}
            </UiButton>
        </div>
    </div>
</template>

<style scoped lang="scss"></style>
