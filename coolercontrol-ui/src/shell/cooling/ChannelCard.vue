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
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiAlert, mdiAutoFix } from '@mdi/js'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { useFanControlWizard } from '@/composables/useFanControlWizard.ts'
import Sparkline from '@/shell/cooling/Sparkline.vue'
import type { CoolingChannel } from '@/shell/cooling/channels.ts'

const props = defineProps<{ channel: CoolingChannel }>()

const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const { currentDeviceStatus } = storeToRefs(deviceStore)
const wizard = useFanControlWizard()

const uiSetting = computed(() =>
    settingsStore.allUIDeviceSettings
        .get(props.channel.deviceUID)
        ?.sensorsAndChannels.get(props.channel.channelName),
)
const channelLabel = computed(() => uiSetting.value?.name ?? props.channel.channelName)
const deviceLabel = computed(
    () => settingsStore.allUIDeviceSettings.get(props.channel.deviceUID)?.name ?? '',
)
const color = computed(() => uiSetting.value?.color ?? '')

const liveDuty = computed(
    () =>
        currentDeviceStatus.value.get(props.channel.deviceUID)?.get(props.channel.channelName)
            ?.duty,
)
const liveRpm = computed(
    () =>
        currentDeviceStatus.value.get(props.channel.deviceUID)?.get(props.channel.channelName)?.rpm,
)

const daemonSetting = computed(() =>
    settingsStore.allDaemonDeviceSettings
        .get(props.channel.deviceUID)
        ?.settings.get(props.channel.channelName),
)

const assignedSummary = computed<string>(() => {
    const setting = daemonSetting.value
    if (setting?.speed_fixed != null) {
        return t('layout.shell.coolingPage.manualAt', { duty: setting.speed_fixed })
    }
    if (setting?.profile_uid != null && setting.profile_uid !== '0') {
        return (
            settingsStore.profiles.find((profile) => profile.uid === setting.profile_uid)?.name ??
            setting.profile_uid
        )
    }
    return t('common.unmanaged')
})

const isUnhealthy = computed(() =>
    settingsStore.healthFailsafe.some(
        (ref) =>
            ref.device_uid === props.channel.deviceUID && ref.name === props.channel.channelName,
    ),
)

const openWizard = (): void => {
    wizard.open({
        deviceUID: props.channel.deviceUID,
        channelName: props.channel.channelName,
        selectedProfileUID:
            daemonSetting.value?.speed_fixed != null
                ? undefined
                : (daemonSetting.value?.profile_uid ?? '0'),
    })
}
</script>

<template>
    <RouterLink
        :to="{
            name: 'cooling-channel',
            params: { deviceUID: channel.deviceUID, channelName: channel.channelName },
        }"
        class="group flex flex-col gap-2 rounded-lg border border-border-one bg-bg-two p-3 outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
        :style="{ borderLeftColor: color, borderLeftWidth: '3px' }"
    >
        <div class="flex items-center gap-2">
            <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                    <span class="truncate font-medium text-text-color">{{ channelLabel }}</span>
                    <svg-icon
                        v-if="isUnhealthy"
                        type="mdi"
                        :path="mdiAlert"
                        :size="14"
                        class="shrink-0 text-warning"
                    />
                </div>
                <div class="truncate text-sm text-text-color-secondary">{{ deviceLabel }}</div>
            </div>
            <button
                v-if="channel.controllable"
                type="button"
                class="ml-auto hidden shrink-0 rounded-lg p-1.5 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent group-hover:block"
                :title="t('layout.shell.coolingPage.guidedSetup')"
                @click.stop.prevent="openWizard"
            >
                <svg-icon type="mdi" :path="mdiAutoFix" :size="18" />
            </button>
        </div>
        <div class="flex items-end justify-between gap-2">
            <div>
                <span class="text-2xl font-semibold tabular-nums text-text-color">
                    {{ liveDuty != null ? `${liveDuty}%` : '--' }}
                </span>
                <span
                    v-if="liveRpm != null"
                    class="ml-2 text-sm tabular-nums text-text-color-secondary"
                >
                    {{ liveRpm }} rpm
                </span>
            </div>
        </div>
        <Sparkline
            :device-u-i-d="channel.deviceUID"
            :channel-name="channel.channelName"
            :color="color"
            class="text-text-color-secondary"
        />
        <div class="truncate text-sm text-text-color-secondary">
            {{ assignedSummary }}
        </div>
    </RouterLink>
</template>
