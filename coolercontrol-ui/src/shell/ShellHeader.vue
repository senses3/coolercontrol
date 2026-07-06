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
import { mdiBookmarkCheck, mdiBookmarkMultipleOutline, mdiBookmarkOutline, mdiTune } from '@mdi/js'
import { DropdownMenuItem, DropdownMenuSeparator } from 'reka-ui'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { DaemonStatus, useDaemonState } from '@/stores/DaemonState.ts'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import UiButton from '@/shell/ui/UiButton.vue'
import UiDropdownMenu from '@/shell/ui/UiDropdownMenu.vue'
import UiTooltip from '@/shell/ui/UiTooltip.vue'

const { t } = useI18n()
const router = useRouter()
const daemonState = useDaemonState()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()

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

const activeModeName = computed<string | undefined>(
    () => settingsStore.modes.find((mode) => mode.uid === settingsStore.modeActiveCurrent)?.name,
)

const itemClass =
    'flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-base ' +
    'text-text-color outline-none data-[highlighted]:bg-surface-hover'
</script>

<template>
    <header class="flex h-12 shrink-0 items-center gap-2.5 px-3">
        <UiTooltip :text="daemonState.status">
            <span class="h-2.5 w-2.5 rounded-full" :class="statusColor" />
        </UiTooltip>
        <span class="text-base text-text-color-secondary">{{ daemonState.systemName }}</span>
        <div class="flex-1" />
        <UiDropdownMenu>
            <template #trigger>
                <UiButton variant="outline">
                    <svg-icon
                        type="mdi"
                        :path="mdiBookmarkMultipleOutline"
                        :size="deviceStore.getREMSize(1.1)"
                    />
                    {{ activeModeName ?? t('layout.shell.modes') }}
                </UiButton>
            </template>
            <DropdownMenuItem
                v-for="mode in settingsStore.modes"
                :key="mode.uid"
                :class="itemClass"
                @select="settingsStore.activateMode(mode.uid)"
            >
                <svg-icon
                    type="mdi"
                    :path="
                        mode.uid === settingsStore.modeActiveCurrent
                            ? mdiBookmarkCheck
                            : mdiBookmarkOutline
                    "
                    :size="15"
                    :class="
                        mode.uid === settingsStore.modeActiveCurrent
                            ? 'text-accent'
                            : 'text-text-color-secondary'
                    "
                />
                <span class="truncate">{{ mode.name }}</span>
            </DropdownMenuItem>
            <div
                v-if="settingsStore.modes.length === 0"
                class="px-2 py-1.5 text-sm text-text-color-secondary"
            >
                {{ t('layout.shell.noModes') }}
            </div>
            <DropdownMenuSeparator class="my-1 h-px bg-border-one" />
            <DropdownMenuItem :class="itemClass" @select="router.push({ name: 'cooling-modes' })">
                <svg-icon type="mdi" :path="mdiTune" :size="15" class="text-text-color-secondary" />
                {{ t('layout.shell.manageModes') }}
            </DropdownMenuItem>
        </UiDropdownMenu>
    </header>
</template>
