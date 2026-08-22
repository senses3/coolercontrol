<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// The machine-scope counterpart to ChannelVerdictNotice: same three parts, an
// observation, the evidence behind it, and links out. Remedies live in the
// docs, never here, so this text can never go stale against them.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
    FOUND_SOMETHING_THAT_WORKS,
    HARDWARE_SUPPORT_DOCS,
    type SystemFinding,
} from '@/models/DeviceHealth.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { actionableFindings, type HardwareNoticeKind } from '@/shell/hardware/findings.ts'
import { useHardwareText } from '@/shell/hardware/useHardwareText.ts'
import DetectionModal from '@/shell/hardware/DetectionModal.vue'
import HardwareReportModal from '@/shell/hardware/HardwareReportModal.vue'
import UiButton from '@/shell/ui/UiButton.vue'

const props = defineProps<{ kind: HardwareNoticeKind }>()
const { t } = useI18n()
const settingsStore = useSettingsStore()
const { findingDetail, noticeHeadline } = useHardwareText()

const findings = computed(() => actionableFindings(settingsStore.healthSystemFindings))

// The chip or driver the daemon named, when it named one. A finding without
// either is machine-wide and the detail line already says everything.
const findingLabel = (finding: SystemFinding): string | undefined =>
    finding.chip_name ?? finding.driver

const detectionOpen = ref(false)
const reportOpen = ref(false)

const headline = computed(() => noticeHeadline(props.kind))
</script>

<template>
    <div class="flex flex-col gap-3 rounded-lg border border-border-one bg-bg-two p-4">
        <p class="text-base text-text-color">{{ headline }}</p>
        <ul v-if="findings.length > 0" class="flex flex-col gap-1">
            <li
                v-for="(finding, index) in findings"
                :key="`${finding.kind}-${findingLabel(finding) ?? index}`"
                class="text-sm text-text-color-secondary"
            >
                <span v-if="findingLabel(finding)" class="text-text-color">
                    {{ findingLabel(finding) }}:
                </span>
                {{ findingDetail(finding) }}
            </li>
        </ul>
        <div class="flex flex-wrap items-center gap-2">
            <UiButton size="sm" variant="outline" @click="detectionOpen = true">
                {{ t('views.appInfo.detectionButton') }}
            </UiButton>
            <UiButton size="sm" variant="outline" @click="reportOpen = true">
                {{ t('views.appInfo.hardwareReportButton') }}
            </UiButton>
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a
                :href="HARDWARE_SUPPORT_DOCS"
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
        <DetectionModal v-model:open="detectionOpen" />
        <HardwareReportModal v-model:open="reportOpen" />
    </div>
</template>
