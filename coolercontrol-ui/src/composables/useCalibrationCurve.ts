/*
 * CoolerControl - monitor and control your cooling and other devices
 * Copyright (c) 2021-2025  Guy Boldon and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { computed, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDialog } from '@/shell/dialog'
import { useCalibrationStatusText } from '@/composables/useCalibrationStatusText.ts'
import { useCalibrationStore } from '@/stores/CalibrationStore.ts'
import type { Calibration } from '@/models/Calibration.ts'
import type { UID } from '@/models/Device.ts'

/**
 * The calibration curve modal, plus the "is this channel actually mapped"
 * question every surface that offers it needs to answer.
 *
 * A completed calibration does not imply calibrated output: a `Stepped` curve
 * is explicit passthrough, and `no_tachometer` arrives as Stepped with a
 * warning. So `mapped` is the narrow case where the dispatcher really applies
 * the RPM mapping, and `degraded` covers a sweep that ran without taking
 * effect. Callers render those two differently.
 */
export function useCalibrationCurve(deviceUID: UID, channelName: string) {
    const { t } = useI18n()
    const dialog = useDialog()
    const calibrationStore = useCalibrationStore()
    const { completedStatusText } = useCalibrationStatusText()

    const curveDialog = defineAsyncComponent(
        () => import('@/components/CalibrationCurveDialog.vue'),
    )

    const calibration = computed((): Calibration | undefined => {
        const status = calibrationStore.statusFor(deviceUID, channelName)
        return status?.phase === 'completed' ? status.calibration : undefined
    })

    const mapped = computed(
        () =>
            calibration.value != null &&
            calibration.value.curve_kind === 'Smooth' &&
            (calibration.value.warnings?.length ?? 0) === 0,
    )
    const degraded = computed(() => calibration.value != null && !mapped.value)
    const statusText = computed(() =>
        calibration.value != null ? completedStatusText(calibration.value) : '',
    )

    const openCurve = (): void => {
        dialog.open(curveDialog, {
            props: {
                header: t('components.calibrationCurve.dialogTitle'),
                position: 'center',
                modal: true,
                dismissableMask: true,
                style: { width: '80vw', maxWidth: '60rem' },
                breakpoints: { '1199px': '90vw', '767px': '95vw' },
            },
            data: { deviceUID, channelName, calibration: calibration.value },
        })
    }

    return { calibration, mapped, degraded, statusText, openCurve }
}
