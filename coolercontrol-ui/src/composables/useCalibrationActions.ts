// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from '@/shell/confirm'
import { useToast } from '@/shell/toast'
import { useAlertCalibrationGuard } from '@/composables/useAlertCalibrationGuard.ts'
import { useCalibrationStore } from '@/stores/CalibrationStore.ts'
import { ErrorResponse } from '@/models/ErrorResponse.ts'
import type { UID } from '@/models/Device.ts'

/**
 * Start / cancel / clear for one channel's calibration, shared by the settings
 * popover panel and the curve dialog so the guards and the wording cannot drift
 * between them.
 *
 * An Active alert watching the channel makes the daemon reject a sweep, so
 * `blockingAlert` names it and callers disable their start buttons on it.
 * `clear` confirms first: a sweep costs minutes of fan noise to reproduce.
 */
export function useCalibrationActions(deviceUID: UID, channelName: string) {
    const { t } = useI18n()
    const toast = useToast()
    const confirm = useConfirm()
    const calibrationStore = useCalibrationStore()
    const { blockingAlertName } = useAlertCalibrationGuard()

    const status = computed(() => calibrationStore.statusFor(deviceUID, channelName))
    const phase = computed(() => status.value?.phase ?? ('not_started' as const))
    const blockingAlert = computed(() => blockingAlertName(deviceUID, channelName))

    const failed = (result: unknown, fallbackKey: string): boolean => {
        if (!(result instanceof ErrorResponse)) return false
        toast.add({
            severity: 'error',
            summary: t('common.error'),
            detail: result.error || t(fallbackKey),
            life: 6000,
        })
        return true
    }

    async function start(): Promise<boolean> {
        const result = await calibrationStore.startCalibration(deviceUID, channelName)
        return !failed(result, 'components.channelExtensionSettings.calibration.startError')
    }

    async function cancel(): Promise<boolean> {
        const result = await calibrationStore.cancelCalibration(deviceUID, channelName)
        return !failed(result, 'components.channelExtensionSettings.calibration.cancelError')
    }

    /** Resolves true only once the user confirmed and the delete succeeded. */
    async function clear(channelLabel: string): Promise<boolean> {
        const confirmed = await new Promise<boolean>((resolve) => {
            confirm.require({
                header: t('components.channelExtensionSettings.calibration.heading'),
                message: t('components.channelExtensionSettings.calibration.clearConfirm', {
                    channel: channelLabel,
                }),
                acceptLabel: t('components.channelExtensionSettings.calibration.buttonClear'),
                rejectLabel: t('common.cancel'),
                defaultFocus: 'reject',
                accept: () => resolve(true),
                reject: () => resolve(false),
            })
        })
        if (!confirmed) return false
        const result = await calibrationStore.deleteCalibration(deviceUID, channelName)
        if (failed(result, 'components.channelExtensionSettings.calibration.clearError')) {
            return false
        }
        toast.add({
            severity: 'info',
            summary: t('components.channelExtensionSettings.calibration.heading'),
            detail: t('components.channelExtensionSettings.calibration.clearedNotice'),
            life: 5000,
        })
        return true
    }

    return { status, phase, blockingAlert, start, cancel, clear }
}
