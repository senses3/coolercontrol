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
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import UiProgressBar from '@/shell/ui/UiProgressBar.vue'
import { mdiChartLine, mdiInformationSlabCircleOutline } from '@mdi/js'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { useCalibrationStore } from '@/stores/CalibrationStore.ts'
import { useCalibrationStatusText } from '@/composables/useCalibrationStatusText.ts'
import { useAlertCalibrationGuard } from '@/composables/useAlertCalibrationGuard.ts'
import { useCalibrationActions } from '@/composables/useCalibrationActions.ts'
import { useCalibrationCurve } from '@/composables/useCalibrationCurve.ts'
import type { UID } from '@/models/Device.ts'

const props = defineProps<{
    deviceUID: UID
    channelName: string
}>()

const emit = defineEmits<{
    (e: 'request-close'): void
}>()

const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const calibrationStore = useCalibrationStore()
const { completedStatusText, stageLabel } = useCalibrationStatusText()
const { watchingAlertCount } = useAlertCalibrationGuard()
const { openCurve } = useCalibrationCurve(props.deviceUID, props.channelName)
const {
    blockingAlert,
    start: startCalibration,
    cancel: cancelCalibration,
    clear: clearCalibration,
} = useCalibrationActions(props.deviceUID, props.channelName)

const channelLabel = computed(
    () =>
        settingsStore.allUIDeviceSettings
            .get(props.deviceUID)
            ?.sensorsAndChannels.get(props.channelName)?.name ?? props.channelName,
)

// Alerts merely watching this fan are paused during the sweep; an Active one
// blocks it outright, which `blockingAlert` above reports.
const watchedByAlerts = computed(
    () => watchingAlertCount([{ deviceUID: props.deviceUID, channelName: props.channelName }]) > 0,
)

const calibrationStatus = computed(() =>
    calibrationStore.statusFor(props.deviceUID, props.channelName),
)

const calibrationPhase = computed(() => calibrationStatus.value?.phase ?? ('not_started' as const))

const calibrationStatusText = computed((): string => {
    const status = calibrationStatus.value
    if (status == null || status.phase === 'not_started') {
        return t('components.channelExtensionSettings.calibration.statusNotCalibrated')
    }
    if (status.phase === 'in_progress') {
        const stage = stageLabel(status.stage)
        return t('components.channelExtensionSettings.calibration.statusInProgress', {
            stage,
            percent: status.percent,
        })
    }
    if (status.phase === 'completed') {
        return completedStatusText(status.calibration)
    }
    return t('components.channelExtensionSettings.calibration.statusFailed', {
        message: status.message,
    })
})

const calibrationHasWarnings = computed((): boolean => {
    const status = calibrationStatus.value
    return status?.phase === 'completed' && (status.calibration.warnings?.length ?? 0) > 0
})

async function onStartCalibration(): Promise<void> {
    await startCalibration()
}

async function onCancelCalibration(): Promise<void> {
    await cancelCalibration()
}

function onViewCurve(): void {
    // Close the host popover first: it returns focus to its trigger on close,
    // which would pull focus back out of the dialog if it went second.
    emit('request-close')
    openCurve()
}

async function onClearCalibration(): Promise<void> {
    await clearCalibration(channelLabel.value)
}

// Resume polling on mount in case a sweep was already running (e.g. the
// user reloaded the page mid-calibration). Mount is the popover-open
// equivalent here: hosts mount this panel only while their popover is
// open, so the lifecycle hook fires at the right moment.
onMounted(() => {
    calibrationStore.ensurePolling(props.deviceUID, props.channelName).catch(() => {})
    // Refresh alert states so the active-alert blocking hint is current.
    settingsStore.loadAlertsAndLogs().catch(() => {})
})
</script>

<template>
    <div>
        <div class="flex items-center mb-2">
            <div
                class="leading-none cursor-help"
                v-tooltip.top="t('components.channelExtensionSettings.calibration.description')"
            >
                <svg-icon
                    type="mdi"
                    class="mr-2"
                    :path="mdiInformationSlabCircleOutline"
                    :size="deviceStore.getREMSize(1.25)"
                />
            </div>
            <span class="font-semibold">
                {{ t('components.channelExtensionSettings.calibration.heading') }}
            </span>
        </div>
        <div :class="['text-sm pb-2', calibrationHasWarnings ? 'text-warning' : '']">
            {{ calibrationStatusText }}
        </div>
        <div v-if="blockingAlert != null" class="text-sm text-warning pb-2">
            {{
                t('components.channelExtensionSettings.calibration.blockedByAlert', {
                    name: blockingAlert,
                })
            }}
        </div>
        <div
            v-else-if="watchedByAlerts && calibrationPhase !== 'in_progress'"
            class="text-xs text-text-color-secondary pb-2"
        >
            {{ t('components.channelExtensionSettings.calibration.alertsPausedNote') }}
        </div>
        <UiProgressBar
            v-if="calibrationPhase === 'in_progress'"
            :value="calibrationStatus?.phase === 'in_progress' ? calibrationStatus.percent : 0"
            class="mb-2"
        />
        <div
            v-if="calibrationPhase === 'not_started' || calibrationPhase === 'failed'"
            class="text-xs text-text-color-secondary pb-2 whitespace-pre-line"
        >
            {{ t('components.channelExtensionSettings.calibration.caveatsBanner') }}
        </div>
        <div class="flex flex-wrap gap-2">
            <button
                v-if="calibrationPhase === 'not_started'"
                type="button"
                :disabled="blockingAlert != null"
                @click="onStartCalibration"
                class="px-3 py-1 rounded border border-border-one hover:bg-surface-hover text-sm disabled:opacity-50 disabled:pointer-events-none"
            >
                {{ t('components.channelExtensionSettings.calibration.buttonCalibrate') }}
            </button>
            <button
                v-if="calibrationPhase === 'in_progress'"
                type="button"
                @click="onCancelCalibration"
                class="px-3 py-1 rounded border border-border-one hover:bg-surface-hover text-sm"
            >
                {{ t('components.channelExtensionSettings.calibration.buttonCancel') }}
            </button>
            <button
                v-if="calibrationPhase === 'completed'"
                type="button"
                @click="onViewCurve"
                class="px-3 py-1 rounded border border-border-one hover:bg-surface-hover text-sm flex items-center gap-1"
            >
                <svg-icon type="mdi" :path="mdiChartLine" :size="deviceStore.getREMSize(1.0)" />
                {{ t('components.channelExtensionSettings.calibration.buttonViewCurve') }}
            </button>
            <button
                v-if="calibrationPhase === 'completed' || calibrationPhase === 'failed'"
                type="button"
                :disabled="blockingAlert != null"
                @click="onStartCalibration"
                class="px-3 py-1 rounded border border-border-one hover:bg-surface-hover text-sm disabled:opacity-50 disabled:pointer-events-none"
            >
                {{ t('components.channelExtensionSettings.calibration.buttonRecalibrate') }}
            </button>
            <button
                v-if="calibrationPhase === 'completed' || calibrationPhase === 'failed'"
                type="button"
                @click="onClearCalibration"
                class="px-3 py-1 rounded border border-border-one hover:bg-surface-hover text-sm"
            >
                {{ t('components.channelExtensionSettings.calibration.buttonClear') }}
            </button>
        </div>
    </div>
</template>
