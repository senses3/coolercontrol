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
// Explains why a channel cannot be driven, using only what the daemon measured
// on this machine. Remedies live in the docs, never here, so this text can
// never go stale against them or contradict the maintainers.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { UID } from '@/models/Device.ts'
import {
    ChannelEvidence,
    ChannelVerdict,
    FOUND_SOMETHING_THAT_WORKS,
    verdictDocsLink,
} from '@/models/DeviceHealth.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'

const props = defineProps<{ deviceUID: UID; channelName: string }>()
const { t } = useI18n()
const settingsStore = useSettingsStore()

const verdictRef = computed(() => settingsStore.channelVerdict(props.deviceUID, props.channelName))

// Keys are written out per verdict rather than interpolated. A template
// literal key is invisible to the static i18n sweep, and an unused-key prune
// has silently deleted that kind of key here before.
const reason = computed<string>(() => {
    switch (verdictRef.value?.verdict) {
        case ChannelVerdict.FirmwareOverride:
            return t('layout.shell.coolingPage.verdictFirmwareOverride')
        case ChannelVerdict.FamilyMayNeedOutOfTree:
            return t('layout.shell.coolingPage.verdictFamilyMayNeedOutOfTree')
        case ChannelVerdict.NotSupportedByDriver:
            return t('layout.shell.coolingPage.verdictNotSupportedByDriver')
        case ChannelVerdict.NoPwm:
            return t('layout.shell.coolingPage.verdictNoPwm')
        case ChannelVerdict.PwmReadOnly:
            return t('layout.shell.coolingPage.verdictPwmReadOnly')
        case ChannelVerdict.IgnoresDuty:
            return t('layout.shell.coolingPage.verdictIgnoresDuty')
        case ChannelVerdict.FanDoesNotSpin:
            return t('layout.shell.coolingPage.verdictFanDoesNotSpin')
        case ChannelVerdict.Unverifiable:
            return t('layout.shell.coolingPage.verdictUnverifiable')
        default:
            // The daemon published no verdict for this channel, so say only the
            // thing we already knew rather than inventing a cause.
            return t('layout.shell.coolingPage.notControllable')
    }
})

/** Only the notable facts, so the line stays readable. */
const evidenceParts = computed<Array<string>>(() => {
    const evidence: ChannelEvidence | undefined = verdictRef.value?.evidence
    if (evidence == null) return []
    const parts: Array<string> = []
    if (!evidence.has_pwm) {
        parts.push(t('layout.shell.coolingPage.evidenceNoPwmFile'))
    } else if (!evidence.pwm_writable) {
        parts.push(t('layout.shell.coolingPage.evidencePwmNotWritable'))
    }
    parts.push(
        evidence.has_rpm
            ? t('layout.shell.coolingPage.evidenceHasTachometer')
            : t('layout.shell.coolingPage.evidenceNoTachometer'),
    )
    return parts
})

const docsLink = computed<string | undefined>(() =>
    verdictRef.value ? verdictDocsLink(verdictRef.value.verdict) : undefined,
)
</script>

<template>
    <div class="flex flex-col gap-2">
        <p class="text-base text-text-color-secondary">{{ reason }}</p>
        <p v-if="evidenceParts.length > 0" class="text-sm text-text-color-secondary">
            {{ t('layout.shell.coolingPage.verdictEvidenceLabel') }}
            {{ evidenceParts.join(', ') }}
        </p>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a
                v-if="docsLink"
                :href="docsLink"
                target="_blank"
                rel="noopener noreferrer"
                class="text-accent underline-offset-2 hover:underline"
            >
                {{ t('layout.shell.coolingPage.verdictLearnMore') }}
            </a>
            <a
                :href="FOUND_SOMETHING_THAT_WORKS"
                target="_blank"
                rel="noopener noreferrer"
                class="text-text-color-secondary underline-offset-2 hover:underline"
            >
                {{ t('layout.shell.coolingPage.verdictFoundSomethingThatWorks') }}
            </a>
        </div>
    </div>
</template>
