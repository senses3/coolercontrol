<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// Always present, because nothing can detect a device that never appeared:
// there is no finding to gate this on, only a user who expected more than they
// see. Kept to one secondary-coloured line so it costs nothing to the majority
// whose hardware works, the same bargain ChannelVerdictNotice makes with its
// unconditional "Found something that works?" link.
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { HARDWARE_SUPPORT_DOCS } from '@/models/DeviceHealth.ts'
import DetectionModal from '@/shell/hardware/DetectionModal.vue'

const { t } = useI18n()
const detectionOpen = ref(false)
</script>

<template>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-color-secondary">
        <span>{{ t('layout.shell.hardwareHelp.missingDevice') }}</span>
        <a
            :href="HARDWARE_SUPPORT_DOCS"
            target="_blank"
            rel="noopener noreferrer"
            class="text-accent underline-offset-2 hover:underline"
        >
            {{ t('views.appInfo.hardwareSupport') }}
        </a>
        <button
            type="button"
            class="rounded underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"
            @click="detectionOpen = true"
        >
            {{ t('views.appInfo.detectionButton') }}
        </button>
        <DetectionModal v-model:open="detectionOpen" />
    </div>
</template>
