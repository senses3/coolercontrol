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
        outcome.verdict === ChannelVerdict.FirmwareOverride ||
        outcome.verdict === ChannelVerdict.FanDoesNotSpin
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
        // Walked all the way to full duty and nothing turned.
        case ChannelVerdict.FanDoesNotSpin:
            return t('layout.shell.coolingPage.probeDidNotStart', values)
        // The ladder stopped short, so nothing is settled.
        case ChannelVerdict.Unverifiable:
            return t('layout.shell.coolingPage.probeStoppedShort', values)
        case ChannelVerdict.IgnoresDuty:
            return t('layout.shell.coolingPage.probeNoResponse', values)
        // Anything else is a verdict this build has never heard of, so say
        // that rather than pick one of the above and state it confidently.
        default:
            return unrecognized(outcome)
    }
}

// Written out per reason rather than interpolated: a template-literal key is
// invisible to the static i18n sweep, and a prune has silently deleted that
// kind of key in this file's neighbourhood before.
function declinedMessage(outcome: ProbeOutcomeDTO): string {
    switch (outcome.reason) {
        case ProbeRefusal.NoTachometer:
            return t('layout.shell.coolingPage.probeDeclinedNoTachometer')
        case ProbeRefusal.AlertActive:
            return t('layout.shell.coolingPage.probeDeclinedAlertActive')
        case ProbeRefusal.TooWarmToLower:
            return t('layout.shell.coolingPage.probeDeclinedTooWarmToLower')
        case ProbeRefusal.NotControllable:
            return t('layout.shell.coolingPage.probeDeclinedNotControllable')
        // Falling back to "no writable fan control" here told a user with a
        // perfectly writable channel exactly that, because the daemon had sent
        // a reason this build did not know. Never assert a cause we were not
        // given.
        default:
            return unrecognized(outcome)
    }
}

/**
 * The honest answer when the daemon sent something this build cannot name,
 * plus the payload in the console.
 *
 * Without the log this is undiagnosable: the daemon's own log prints its
 * internal enum name, not the JSON, so a mismatch between the two sides is
 * invisible from either end alone.
 */
function unrecognized(outcome: ProbeOutcomeDTO): string {
    console.error('Unrecognized probe outcome from the daemon:', JSON.stringify(outcome))
    return t('layout.shell.coolingPage.probeUnrecognized')
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
