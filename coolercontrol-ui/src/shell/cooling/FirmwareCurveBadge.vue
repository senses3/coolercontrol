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
// Marks a channel whose curve the device firmware runs rather than the daemon,
// which otherwise is only visible inside the channel's Settings popover.
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiChip } from '@mdi/js'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { firmwareCurveApplicable } from '@/shell/cooling/firmwareCurve.ts'
import { ChannelExtensionNames } from '@/models/SpeedOptions.ts'
import type { Profile } from '@/models/Profile.ts'
import UiTooltip from '@/shell/ui/UiTooltip.vue'
import type { UID } from '@/models/Device.ts'

const props = withDefaults(defineProps<{ deviceUID: UID; channelName: string; size?: number }>(), {
    size: 14,
})

const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()

// Two extensions drive the same idea: AMD RDNA3/4 GPUs and devices with their
// own auto curve. Either flag being set means the user opted in.
const optedIn = computed((): boolean => {
    const extension = settingsStore.ccDeviceSettings
        .get(props.deviceUID)
        ?.channel_settings.get(props.channelName)?.extension
    return extension?.hw_fan_curve_enabled === true || extension?.auto_hw_curve_enabled === true
})

const extensionKind = computed((): ChannelExtensionNames | undefined => {
    for (const device of deviceStore.allDevices()) {
        if (device.uid !== props.deviceUID) continue
        return device.info?.channels.get(props.channelName)?.speed_options?.extension
    }
    return undefined
})

const assignedProfile = computed((): Profile | undefined => {
    const uid = settingsStore.allDaemonDeviceSettings
        .get(props.deviceUID)
        ?.settings.get(props.channelName)?.profile_uid
    if (uid == null || uid === '0') return undefined
    return settingsStore.profiles.find((profile) => profile.uid === uid)
})

// Opting in is not enough: the daemon keeps computing the curve unless the
// assigned profile is one the device can run itself, so only badge the
// channels whose fan the firmware is actually driving.
const active = computed(
    () =>
        optedIn.value &&
        firmwareCurveApplicable(assignedProfile.value, props.deviceUID, extensionKind.value),
)
</script>

<template>
    <UiTooltip
        v-if="active"
        :text="t('components.channelExtensionSettings.firmwareControlledProfile')"
    >
        <svg-icon
            type="mdi"
            :path="mdiChip"
            :size="size"
            class="shrink-0 text-text-color-secondary"
        />
    </UiTooltip>
</template>
