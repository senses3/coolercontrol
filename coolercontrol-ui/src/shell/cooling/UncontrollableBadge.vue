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
// Marks a fan channel the daemon has determined it cannot drive, with the
// reason in the tooltip. Cooling panel only, and silent for working hardware:
// there is nothing to tell a user about a fan that already does what they ask.
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiFanOff } from '@mdi/js'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChannelVerdict } from '@/models/DeviceHealth.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import UiTooltip from '@/shell/ui/UiTooltip.vue'
import type { UID } from '@/models/Device.ts'

const props = withDefaults(defineProps<{ deviceUID: UID; channelName: string; size?: number }>(), {
    size: 14,
})

const { t } = useI18n()
const settingsStore = useSettingsStore()

const verdictRef = computed(() => settingsStore.channelVerdict(props.deviceUID, props.channelName))

// Static keys per verdict: a template-literal key is invisible to the i18n
// sweep and an unused-key prune has deleted that kind of key here before.
const tooltip = computed<string>(() => {
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
        case ChannelVerdict.Unverifiable:
            return t('layout.shell.coolingPage.verdictUnverifiable')
        default:
            return t('layout.shell.coolingPage.notControllable')
    }
})

// Unverifiable is not a failure to drive the fan, only a failure to prove it
// responded, so it must not be badged as uncontrollable.
const active = computed(
    () =>
        verdictRef.value != null &&
        verdictRef.value.verdict !== ChannelVerdict.Controllable &&
        verdictRef.value.verdict !== ChannelVerdict.Unverifiable,
)
</script>

<template>
    <UiTooltip v-if="active" :text="tooltip">
        <svg-icon
            type="mdi"
            :path="mdiFanOff"
            :size="size"
            class="shrink-0 text-text-color-secondary"
        />
    </UiTooltip>
</template>
