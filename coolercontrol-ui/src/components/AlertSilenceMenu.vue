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
