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
import {
    mdiAlertCircleOutline,
    mdiCheckCircleOutline,
    mdiCircleOutline,
    mdiInformationSlabCircleOutline,
    mdiLoading,
    mdiMinus,
    mdiMinusCircleOutline,
    mdiTuneVerticalVariant,
} from '@mdi/js'
import UiButton from '@/shell/ui/UiButton.vue'
import UiCheckbox from '@/shell/ui/UiCheckbox.vue'
import UiNumberInput from '@/shell/ui/UiNumberInput.vue'
import { computed, inject, onMounted, ref, type Ref } from 'vue'
import type { DynamicDialogInstance } from '@/shell/dialog'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/shell/toast'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { useCalibrationStore } from '@/stores/CalibrationStore.ts'
import { useAlertCalibrationGuard } from '@/composables/useAlertCalibrationGuard.ts'
import { ErrorResponse } from '@/models/ErrorResponse.ts'
import type { CalibrationBatchEntry, CalibrationStage } from '@/models/Calibration.ts'

const dialogRef: Ref<DynamicDialogInstance> = inject('dialogRef')!
const closeDialog = (): void => dialogRef.value.close()
const { t } = useI18n()
const toast = useToast()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const calibrationStore = useCalibrationStore()
const { blockingAlertName, watchingAlertCount } = useAlertCalibrationGuard()

// The daemon owns the batch, so on open we resume an in-progress run
// rather than always starting at the picker.
const batchActive = (): boolean => calibrationStore.batchStatus?.active === true
const step: Ref<number> = ref(batchActive() ? 2 : 1)
onMounted(async () => {
    // Refresh alert states so the active-alert blocking hints are current.
    settingsStore.loadAlertsAndLogs().catch(() => {})
    await calibrationStore.ensureBatchPolling()
    if (batchActive()) step.value = 2
})

// Step 1: pick the fans to calibrate (uncalibrated pre-selected).
interface FanRow {
    deviceUID: string
    channelName: string
    label: string
    color: string
    selected: boolean
    alreadyCalibrated: boolean
}
const fanRows: Ref<Array<FanRow>> = ref([])
// When launched from Auto-Create, the dialog passes the fans being assigned so they are pre-selected
// instead of the default (all uncalibrated).
const preselectKeys = ((): Set<string> | null => {
    const preselect = dialogRef.value.data?.preselect as
        | Array<{ deviceUID: string; channelName: string }>
        | undefined
    return preselect == null
        ? null
        : new Set(preselect.map((fan) => `${fan.deviceUID}||${fan.channelName}`))
})()
const fillFans = (): void => {
    fanRows.value.length = 0
    for (const device of deviceStore.allDevices()) {
        if (device.info == null) continue
        const deviceSettings = settingsStore.allUIDeviceSettings.get(device.uid)
        if (deviceSettings == null) continue
        for (const [channelName, channelInfo] of device.info.channels.entries()) {
            if (!(channelInfo.speed_options?.fixed_enabled ?? false)) continue
            const sc = deviceSettings.sensorsAndChannels.get(channelName)
            const calibrated =
                calibrationStore.statusFor(device.uid, channelName)?.phase === 'completed'
            fanRows.value.push({
                deviceUID: device.uid,
                channelName,
                label: sc?.name ?? channelName,
                color: sc?.color ?? '#888888',
                selected: preselectKeys
                    ? preselectKeys.has(`${device.uid}||${channelName}`)
                    : !calibrated,
                alreadyCalibrated: calibrated,
            })
        }
    }
}
fillFans()

// A fan with a currently Active alert cannot be calibrated; the daemon
// rejects it, so the picker keeps it out of the selection.
const rowBlockedBy = (row: FanRow): string | undefined =>
    blockingAlertName(row.deviceUID, row.channelName)
const selectedRows = computed(() =>
    fanRows.value.filter((row) => row.selected && rowBlockedBy(row) == null),
)
const allSelected = computed(() => {
    const selectable = fanRows.value.filter((row) => rowBlockedBy(row) == null)
    return selectable.length > 0 && selectable.every((row) => row.selected)
})
const toggleAll = (): void => {
    const target = !allSelected.value
    for (const row of fanRows.value) {
        if (rowBlockedBy(row) != null) {
            row.selected = false
            continue
        }
        row.selected = target
    }
}
// Alerts watching the selected fans are paused only while each fan's own
// sweep runs; this is the informational note under the picker.
const pausedAlertCount = computed(() => watchingAlertCount(selectedRows.value))
// Master "select all" checkbox: indeterminate when only some are selected,
// and clicking it (any state) toggles the whole list.
const partiallySelected = computed(() => selectedRows.value.length > 0 && !allSelected.value)
const selectAllModel = computed<boolean>({
    get: () => allSelected.value,
    set: () => toggleAll(),
})

// How many fans to calibrate at once. 1 (sequential) is the safe default;
// the daemon clamps it to the number of selected fans.
const concurrency: Ref<number> = ref(1)
const starting: Ref<boolean> = ref(false)
const startBatch = async (): Promise<void> => {
    starting.value = true
    const channels = selectedRows.value.map((row) => ({
        device_uid: row.deviceUID,
        channel_name: row.channelName,
    }))
    const result = await calibrationStore.startBatch(channels, concurrency.value)
    starting.value = false
    if (result !== true) {
        toast.add({
            severity: 'error',
            summary: t('common.error'),
            detail:
                result instanceof ErrorResponse
                    ? result.error
                    : t('components.wizards.calibration.startFailed'),
            life: 4000,
        })
        return
    }
    step.value = 2
}

const cancelBatch = async (): Promise<void> => {
    await calibrationStore.cancelBatch()
}

// Step 2: observe the daemon-driven batch.
const entries = computed<Array<CalibrationBatchEntry>>(
    () => calibrationStore.batchStatus?.entries ?? [],
)
const isActive = computed(() => calibrationStore.batchStatus?.active === true)
const totalCount = computed(() => entries.value.length)
const finishedCount = computed(
    () =>
        entries.value.filter((entry) => entry.phase !== 'queued' && entry.phase !== 'running')
            .length,
)
const currentNumber = computed(() => {
    const index = entries.value.findIndex((entry) => entry.phase === 'running')
    return index >= 0 ? index + 1 : finishedCount.value
})
const doneCount = computed(() => entries.value.filter((entry) => entry.phase === 'done').length)
const failedCount = computed(() => entries.value.filter((entry) => entry.phase === 'failed').length)
const skippedCount = computed(
    () => entries.value.filter((entry) => entry.phase === 'cancelled').length,
)

const entryLabel = (deviceUID: string, channelName: string): string =>
    settingsStore.allUIDeviceSettings.get(deviceUID)?.sensorsAndChannels.get(channelName)?.name ??
    channelName

const stageLabel = (stage: CalibrationStage): string => {
    switch (stage) {
        case 'preflight':
            return t('components.wizards.calibration.stagePreflight')
        case 'up_sweep':
            return t('components.wizards.calibration.stageUpSweep')
        case 'down_sweep':
            return t('components.wizards.calibration.stageDownSweep')
        case 'finalizing':
            return t('components.wizards.calibration.stageFinalizing')
    }
}
const runningText = (entry: CalibrationBatchEntry): string => {
    if (entry.stage == null || entry.percent == null)
        return t('components.wizards.calibration.queued')
    return `${stageLabel(entry.stage)} ${entry.percent}%`
}

const phaseIcon = (phase: CalibrationBatchEntry['phase']): string => {
    switch (phase) {
        case 'done':
            return mdiCheckCircleOutline
        case 'failed':
            return mdiAlertCircleOutline
        case 'cancelled':
            return mdiMinusCircleOutline
        case 'running':
            return mdiLoading
        default:
            return mdiCircleOutline
    }
}
const phaseClass = (phase: CalibrationBatchEntry['phase']): string => {
    switch (phase) {
        case 'done':
            return 'text-accent'
        case 'failed':
            return 'text-warning'
        case 'running':
            return 'text-accent animate-spin'
        default:
            return 'text-text-color-secondary'
    }
}
</script>

<template>
    <div class="flex flex-col justify-between min-w-96 w-[40vw] min-h-max h-[50vh]">
        <!-- Step 1: pick fans -->
        <div v-if="step === 1" class="flex flex-col gap-y-3 overflow-y-auto">
            <small class="ml-1 font-light text-sm">
                {{ t('components.wizards.calibration.pickIntro') }}
            </small>
            <div v-if="fanRows.length === 0" class="ml-1 text-text-color-secondary">
                {{ t('components.wizards.calibration.noFans') }}
            </div>
            <template v-else>
                <div class="flex items-center gap-x-2 ml-1 pb-2 border-b border-border-one">
                    <UiCheckbox v-model="selectAllModel" :indeterminate="partiallySelected" />
                    <span class="text-sm font-medium cursor-pointer select-none" @click="toggleAll">
                        {{ t('components.wizards.calibration.selectAll') }}
                    </span>
                </div>
                <div
                    v-for="(row, index) in fanRows"
                    :key="row.deviceUID + row.channelName"
                    class="flex items-center gap-x-2 ml-1"
                >
                    <UiCheckbox
                        v-model="fanRows[index].selected"
                        :disabled="rowBlockedBy(row) != null"
                    />
                    <svg-icon
                        type="mdi"
                        :path="mdiMinus"
                        :size="16"
                        :style="{ color: row.color }"
                    />
                    <span class="truncate">{{ row.label }}</span>
                    <span v-if="rowBlockedBy(row) != null" class="text-xs text-warning">
                        {{
                            t('components.wizards.calibration.blockedByAlert', {
                                name: rowBlockedBy(row),
                            })
                        }}
                    </span>
                    <span v-else-if="row.alreadyCalibrated" class="text-xs text-accent">
                        {{ t('components.wizards.calibration.calibratedBadge') }}
                    </span>
                </div>
            </template>
            <template v-if="fanRows.length > 1">
                <div class="flex items-center justify-between gap-x-3 ml-1 mt-1">
                    <span class="text-sm">
                        {{ t('components.wizards.calibration.concurrencyLabel') }}
                    </span>
                    <UiNumberInput v-model="concurrency" :min="1" :max="fanRows.length" :step="1" />
                </div>
                <span class="text-xs text-text-color-secondary ml-1">
                    {{ t('components.wizards.calibration.concurrencyNote') }}
                </span>
            </template>
            <div v-if="pausedAlertCount > 0" class="flex items-start gap-x-2 ml-1 mt-1">
                <svg-icon
                    type="mdi"
                    class="shrink-0 mt-0.5"
                    :path="mdiInformationSlabCircleOutline"
                    :size="deviceStore.getREMSize(1.2)"
                />
                <span class="text-sm">
                    {{
                        t('components.wizards.calibration.alertsPausedNote', {
                            count: pausedAlertCount,
                        })
                    }}
                </span>
            </div>
            <div class="flex items-start gap-x-2 ml-1 mt-1">
                <svg-icon
                    type="mdi"
                    class="shrink-0 mt-0.5"
                    :path="mdiInformationSlabCircleOutline"
                    :size="deviceStore.getREMSize(1.2)"
                />
                <span class="text-sm">{{ t('components.wizards.calibration.idleNote') }}</span>
            </div>
        </div>

        <!-- Step 2: observe the daemon-driven batch -->
        <div v-else class="flex flex-col gap-y-2 overflow-y-auto">
            <small class="ml-1 font-light text-sm">
                {{
                    isActive
                        ? t('components.wizards.calibration.running', {
                              current: currentNumber,
                              total: totalCount,
                          })
                        : t('components.wizards.calibration.summary', {
                              done: doneCount,
                              failed: failedCount,
                              skipped: skippedCount,
                          })
                }}
            </small>
            <div
                v-for="entry in entries"
                :key="entry.device_uid + entry.channel_name"
                class="flex items-center justify-between gap-x-3 ml-1"
            >
                <div class="flex items-center gap-x-2 min-w-0">
                    <!-- overflow-hidden clips the running spinner's rotation to its own box so it
                         does not expand the scroll container and flicker a scrollbar. -->
                    <span class="shrink-0 inline-flex overflow-hidden">
                        <svg-icon
                            type="mdi"
                            :class="phaseClass(entry.phase)"
                            :path="phaseIcon(entry.phase)"
                            :size="deviceStore.getREMSize(1.2)"
                        />
                    </span>
                    <span class="truncate">{{
                        entryLabel(entry.device_uid, entry.channel_name)
                    }}</span>
                </div>
                <div class="text-right text-sm shrink-0">
                    <span v-if="entry.phase === 'running'" class="text-accent">{{
                        runningText(entry)
                    }}</span>
                    <span v-else-if="entry.phase === 'queued'" class="text-text-color-secondary">{{
                        t('components.wizards.calibration.queued')
                    }}</span>
                    <span v-else-if="entry.phase === 'done'" class="text-accent">{{
                        t('components.wizards.calibration.done')
                    }}</span>
                    <span
                        v-else-if="entry.phase === 'cancelled'"
                        class="text-text-color-secondary"
                        >{{ t('components.wizards.calibration.skipped') }}</span
                    >
                    <span v-else class="text-warning">{{
                        entry.message ?? t('components.wizards.calibration.failed')
                    }}</span>
                </div>
            </div>
        </div>

        <!-- Footer -->
        <div class="flex flex-row justify-between mt-4">
            <UiButton
                v-if="step === 1"
                variant="ghost"
                class="w-24 !bg-bg-one"
                @click="closeDialog"
            >
                {{ t('common.cancel') }}
            </UiButton>
            <div v-else />
            <UiButton
                v-if="step === 1"
                variant="solid"
                class="w-40"
                :disabled="selectedRows.length === 0 || starting"
                @click="startBatch"
            >
                {{ t('components.wizards.calibration.start') }}
                <svg-icon
                    class="outline-0"
                    type="mdi"
                    :path="mdiTuneVerticalVariant"
                    :size="deviceStore.getREMSize(1.5)"
                />
            </UiButton>
            <UiButton
                v-else-if="isActive"
                variant="ghost"
                class="w-28 !bg-bg-one"
                @click="cancelBatch"
            >
                {{ t('common.cancel') }}
            </UiButton>
            <UiButton v-else variant="solid" class="w-28" @click="closeDialog">
                {{ t('components.wizards.calibration.close') }}
            </UiButton>
        </div>
    </div>
</template>

<style scoped lang="scss"></style>
