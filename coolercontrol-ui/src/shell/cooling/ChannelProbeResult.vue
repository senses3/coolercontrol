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
// The duty-response probe is the one action in the app that moves hardware to
// answer a question, so it is triggered by hand from the setup menu, next to
// the other action that moves a fan. This renders only its result: nothing at
// all until a test has been asked for, so there is no control sitting on the
// page waiting for a question nobody asked.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UID } from '@/models/Device.ts'
import { ChannelVerdict, ProbeOutcomeDTO, ProbeRefusal } from '@/models/DeviceHealth.ts'
import { ErrorResponse } from '@/models/ErrorResponse.ts'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'

const props = defineProps<{ deviceUID: UID; channelName: string }>()
const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()

const running = ref(false)
const result = ref('')
/**
 * Set only where the probe established that the fan is not being driven.
 * A declined test and an inconclusive one are not failures, and colouring them
 * as such would report a problem the daemon did not find.
 */
const resultIsAdverse = ref(false)

async function run(): Promise<void> {
    if (running.value) return
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

defineExpose({ run })

function applyOutcome(outcome: ProbeOutcomeDTO | ErrorResponse): void {
    if (outcome instanceof ErrorResponse) {
        resultIsAdverse.value = true
        result.value = t('layout.shell.coolingPage.probeFailed', { error: outcome.error })
        return
    }
    resultIsAdverse.value =
        outcome.verdict === ChannelVerdict.IgnoresDuty ||
        outcome.verdict === ChannelVerdict.FirmwareOverride
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
        // The fan was stopped to begin with and never started. A stopped fan
        // and an empty header look identical from here, so say both.
        case ChannelVerdict.Unverifiable:
            return t('layout.shell.coolingPage.probeDidNotStart', values)
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
    <p
        v-if="message"
        class="text-sm"
        :class="resultIsAdverse && !running ? 'text-error' : 'text-text-color-secondary'"
    >
        {{ message }}
    </p>
</template>
