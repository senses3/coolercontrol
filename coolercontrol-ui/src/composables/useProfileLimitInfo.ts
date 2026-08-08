// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { useI18n } from 'vue-i18n'

const DEFAULT_PROFILE_MAX_LENGTH = 17

export interface LimitInputs {
    profileMaxLength: number
    amdGpuOverdrive?: boolean
    tempName: string
}

export interface LimitInfo {
    badge: string
    message: string
}

export function useProfileLimitInfo() {
    const { t } = useI18n()
    const getLimitInfo = (input: LimitInputs): LimitInfo | null => {
        if (input.profileMaxLength >= DEFAULT_PROFILE_MAX_LENGTH) return null
        const isAmd = input.amdGpuOverdrive === true && input.tempName === 'temp1'
        const messageKey = isAmd
            ? 'views.profiles.curveLimitedByAmdGpu'
            : 'views.profiles.curveLimitedByFirmware'
        return {
            badge: t('views.profiles.curvePointLimitBadge', { n: input.profileMaxLength }),
            message: t(messageKey, { n: input.profileMaxLength }),
        }
    }
    return { getLimitInfo }
}
