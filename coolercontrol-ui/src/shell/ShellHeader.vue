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
import { mdiBookmarkMultipleOutline } from '@mdi/js'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { DaemonStatus, useDaemonState } from '@/stores/DaemonState.ts'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import UiButton from '@/shell/ui/UiButton.vue'
import UiTooltip from '@/shell/ui/UiTooltip.vue'

const { t } = useI18n()
const daemonState = useDaemonState()
const deviceStore = useDeviceStore()

const statusColor = computed(() => {
    switch (daemonState.status) {
        case DaemonStatus.OK:
            return 'bg-success'
        case DaemonStatus.WARN:
            return 'bg-warning'
        default:
            return 'bg-error'
    }
})
</script>

<template>
    <header class="flex h-12 shrink-0 items-center gap-2.5 px-3">
        <UiTooltip :text="daemonState.status">
            <span class="h-2.5 w-2.5 rounded-full" :class="statusColor" />
        </UiTooltip>
        <span class="text-sm text-text-color-secondary">{{ daemonState.systemName }}</span>
        <div class="flex-1" />
        <UiTooltip :text="t('layout.shell.laterPhase')">
            <span>
                <UiButton variant="outline" disabled>
                    <svg-icon
                        type="mdi"
                        :path="mdiBookmarkMultipleOutline"
                        :size="deviceStore.getREMSize(1.1)"
                    />
                    {{ t('layout.shell.modes') }}
                </UiButton>
            </span>
        </UiTooltip>
    </header>
</template>
