<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import { DropdownMenuItem } from 'reka-ui'
import UiDropdownMenu from '@/shell/ui/UiDropdownMenu.vue'
import { dropdownItemClass } from '@/shell/ui/dropdownItemClass.ts'
import { Alert, alertIsSilenced } from '@/models/Alert.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { useI18n } from 'vue-i18n'

// The one silence menu shared by the overview cards, the alert editor, and
// the monitoring panel rows. The trigger slot carries each surface's button;
// the durations and the store calls live only here.
const props = defineProps<{ alert: Alert }>()
const settingsStore = useSettingsStore()
const { t } = useI18n()

const durations = [
    { minutes: 15, key: 'views.alerts.silence15m' },
    { minutes: 60, key: 'views.alerts.silence1h' },
    { minutes: 480, key: 'views.alerts.silence8h' },
    { minutes: 1440, key: 'views.alerts.silence24h' },
]
</script>

<template>
    <UiDropdownMenu>
        <template #trigger>
            <slot name="trigger" />
        </template>
        <DropdownMenuItem
            v-for="duration in durations"
            :key="duration.minutes"
            :class="dropdownItemClass"
            @select="settingsStore.silenceAlert(props.alert.uid, duration.minutes)"
        >
            {{ t(duration.key) }}
        </DropdownMenuItem>
        <DropdownMenuItem
            v-if="alertIsSilenced(props.alert)"
            :class="dropdownItemClass"
            @select="settingsStore.unsilenceAlert(props.alert.uid)"
        >
            {{ t('views.alerts.unsilence') }}
        </DropdownMenuItem>
    </UiDropdownMenu>
</template>
