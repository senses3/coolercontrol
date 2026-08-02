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
// The one control in the app that moves hardware to answer a question, so it
// is per channel and only ever runs when pressed. It lives on the controllable
// path deliberately: a channel with no writable fan control is already
// explained by its verdict, and the probe would only refuse.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { mdiFan, mdiLoading } from '@mdi/js'
import { UID } from '@/models/Device.ts'
import { ChannelVerdict, ProbeOutcomeDTO, ProbeRefusal } from '@/models/DeviceHealth.ts'
import { ErrorResponse } from '@/models/ErrorResponse.ts'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import UiButton from '@/shell/ui/UiButton.vue'

const props = defineProps<{ deviceUID: UID; channelName: string }>()
const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()

const running = ref(false)
const result = ref<string>('')
/** Set only for outcomes that mean the fan is not actually being driven. */
const resultIsAdverse = ref(false)

async function runProbe(): Promise<void> {
    running.value = true
    result.value = ''
    try {
        const outcome = await deviceStore.daemonClient.probeChannel(
            props.deviceUID,
            props.channelName,
        )
        applyOutcome(outcome)
        // The daemon publishes what the probe established, so pull the health
        // snapshot back rather than deriving a second copy of the verdict here.
        await settingsStore.loadDeviceHealth()
    } finally {
        running.value = false
    }
}

function applyOutcome(outcome: ProbeOutcomeDTO | ErrorResponse): void {
    if (outcome instanceof ErrorResponse) {
        resultIsAdverse.value = true
        result.value = t('layout.shell.coolingPage.probeFailed', { error: outcome.error })
        return
    }
    resultIsAdverse.value = outcome.verdict !== ChannelVerdict.Controllable
    result.value =
        outcome.outcome === 'completed' ? completedMessage(outcome) : declinedMessage(outcome)
}

function completedMessage(outcome: ProbeOutcomeDTO): string {
    const values = {
        baseline: outcome.baseline_rpm ?? 0,
        observed: outcome.observed_rpm ?? 0,
        duty: outcome.probed_duty ?? 0,
    }
    switch (outcome.verdict) {
        case ChannelVerdict.Controllable:
            return t('layout.shell.coolingPage.probeResponded', values)
        case ChannelVerdict.FirmwareOverride:
            return t('layout.shell.coolingPage.probeFirmwareOverride')
        default:
            return t('layout.shell.coolingPage.probeNoResponse', values)
    }
}

// Written out per reason rather than interpolated: a template-literal key is
// invisible to the static i18n sweep, and a prune has silently deleted that
// kind of key in this file's neighbourhood before.
function declinedMessage(outcome: ProbeOutcomeDTO): string {
    switch (outcome.reason) {
        case ProbeRefusal.NoTachometer:
            return t('layout.shell.coolingPage.probeDeclinedNoTachometer')
        case ProbeRefusal.NoBaselineRpm:
            return t('layout.shell.coolingPage.probeDeclinedNoBaselineRpm')
        case ProbeRefusal.AlertActive:
            return t('layout.shell.coolingPage.probeDeclinedAlertActive')
        case ProbeRefusal.TooWarmToLower:
            return t('layout.shell.coolingPage.probeDeclinedTooWarmToLower')
        default:
            return t('layout.shell.coolingPage.probeDeclinedNotControllable')
    }
}

const message = computed(() =>
    running.value ? t('layout.shell.coolingPage.probeRunning') : result.value,
)
</script>

<template>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <UiButton
            v-tooltip.top="t('layout.shell.coolingPage.probeTooltip')"
            variant="outline"
            :disabled="running"
            @click="runProbe"
        >
            <svg-icon
                type="mdi"
                :path="running ? mdiLoading : mdiFan"
                :size="16"
                :class="running ? 'animate-spin' : ''"
            />
            {{ t('layout.shell.coolingPage.probeButton') }}
        </UiButton>
        <span
            v-if="message"
            class="text-sm"
            :class="resultIsAdverse && !running ? 'text-error' : 'text-text-color-secondary'"
        >
            {{ message }}
        </span>
    </div>
</template>
