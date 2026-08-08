<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// What the startup probe found. This is the answer for the cohort that sees no
// hardware at all: Secure Boot silently defeating module loading has no other
// visible symptom in the app.
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import UiModal from '@/shell/ui/UiModal.vue'
import { DetectionDTO } from '@/models/DeviceHealth.ts'
import { useDeviceStore } from '@/stores/DeviceStore.ts'

const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const deviceStore = useDeviceStore()

const detection = ref(new DetectionDTO())
const loading = ref(false)

watch(open, async (isOpen) => {
    if (!isOpen) return
    loading.value = true
    detection.value = await deviceStore.daemonClient.loadDetection()
    loading.value = false
})
</script>

<template>
    <UiModal
        v-model:open="open"
        :title="t('views.appInfo.detection')"
        :description="t('views.appInfo.detectionDescription')"
        :content-style="{ width: '50vw' }"
    >
        <div v-if="loading" class="p-3 text-base text-text-color-secondary">
            {{ t('common.loading') }}
        </div>
        <!-- probed=false means no probe was made, so an empty chip list is
             "not looked for" and must not be shown as a clean scan. -->
        <div v-else-if="!detection.probed" class="p-3 text-base text-text-color-secondary">
            {{ t('views.appInfo.detectionNotRun') }}
        </div>
        <div v-else class="flex max-h-[60vh] flex-col gap-4 overflow-auto">
            <div class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-base">
                <span class="text-text-color-secondary">
                    {{ t('views.appInfo.detectionSecureBoot') }}
                </span>
                <span class="text-text-color">
                    {{ detection.environment.is_secure_boot ? t('common.yes') : t('common.no') }}
                </span>
                <span class="text-text-color-secondary">
                    {{ t('views.appInfo.detectionContainer') }}
                </span>
                <span class="text-text-color">
                    {{ detection.environment.is_container ? t('common.yes') : t('common.no') }}
                </span>
                <span class="text-text-color-secondary">
                    {{ t('views.appInfo.detectionDevPort') }}
                </span>
                <span class="text-text-color">
                    {{ detection.environment.has_dev_port ? t('common.yes') : t('common.no') }}
                </span>
            </div>

            <div v-if="detection.detected_chips.length > 0" class="flex flex-col gap-1">
                <span class="text-base font-medium text-text-color">
                    {{ t('views.appInfo.detectionChips') }}
                </span>
                <div
                    v-for="chip in detection.detected_chips"
                    :key="`${chip.name}/${chip.address}`"
                    class="rounded-lg px-2 py-1.5"
                >
                    <span class="text-base text-text-color">{{ chip.name }}</span>
                    <span class="block text-sm text-text-color-secondary">
                        {{ chip.address }} id:{{ chip.device_id }} &middot;
                        {{ chip.driver }} &middot; {{ chip.module_status }}
                    </span>
                </div>
            </div>
            <div v-else class="text-base text-text-color-secondary">
                {{ t('views.appInfo.detectionNoChips') }}
            </div>

            <div v-if="detection.blacklisted.length > 0" class="flex flex-col gap-1">
                <span class="text-base font-medium text-text-color">
                    {{ t('views.appInfo.detectionBlacklisted') }}
                </span>
                <span class="text-sm text-text-color-secondary">
                    {{ detection.blacklisted.join(', ') }}
                </span>
            </div>
        </div>
    </UiModal>
</template>
