<!--
  SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import UiToggleGroup from '@/shell/ui/UiToggleGroup.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// Component boundary with a primitive model so an open tooltip survives parent
// re-renders (see MenuHealthIcon.vue); the Info page updates on every log line.
const model = defineModel<string>({ required: true })
const { t } = useI18n({ useScope: 'global' })

const backendOptions = computed(() => [
    { label: t('views.appInfo.stressNgBackend'), value: 'stress_ng' },
    { label: t('views.appInfo.builtInBackend'), value: 'built_in' },
])
</script>

<template>
    <UiToggleGroup
        v-model="model"
        v-tooltip.top="{ escape: false, value: t('views.appInfo.backendTooltip') }"
        :options="backendOptions"
    />
</template>
