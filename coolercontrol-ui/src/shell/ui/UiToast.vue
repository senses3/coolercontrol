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
import {
    mdiAlertCircleOutline,
    mdiAlertOutline,
    mdiCheckCircleOutline,
    mdiClose,
    mdiInformationOutline,
} from '@mdi/js'
import { activeToasts, useToast } from '@/shell/toast'

const { remove } = useToast()

// error/danger share the red style; info/primary share accent.
const styleFor = (
    severity: string | undefined,
): { icon: string; color: string; border: string } => {
    switch (severity) {
        case 'success':
            return {
                icon: mdiCheckCircleOutline,
                color: 'text-success',
                border: 'border-l-success',
            }
        case 'warn':
            return { icon: mdiAlertOutline, color: 'text-warning', border: 'border-l-warning' }
        case 'error':
        case 'danger':
            return { icon: mdiAlertCircleOutline, color: 'text-error', border: 'border-l-error' }
        default:
            return { icon: mdiInformationOutline, color: 'text-accent', border: 'border-l-accent' }
    }
}
</script>

<template>
    <Teleport to="body">
        <div
            class="pointer-events-none fixed left-1/2 top-4 z-[1400] flex w-[24rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-2"
        >
            <TransitionGroup
                enter-active-class="transition duration-200 ease-out"
                enter-from-class="-translate-y-2 opacity-0"
                leave-active-class="transition duration-150 ease-in"
                leave-to-class="opacity-0"
            >
                <div
                    v-for="toast in activeToasts"
                    :key="toast.id"
                    class="pointer-events-auto flex items-start gap-3 rounded-lg border border-l-4 border-border-one bg-bg-two p-3 shadow-md"
                    :class="styleFor(toast.severity).border"
                    role="alert"
                >
                    <svg-icon
                        type="mdi"
                        class="mt-0.5 shrink-0"
                        :class="styleFor(toast.severity).color"
                        :path="styleFor(toast.severity).icon"
                        :size="20"
                    />
                    <div class="min-w-0 flex-1">
                        <div v-if="toast.summary" class="font-semibold text-text-color">
                            {{ toast.summary }}
                        </div>
                        <div v-if="toast.detail" class="text-sm text-text-color-secondary">
                            {{ toast.detail }}
                        </div>
                    </div>
                    <button
                        type="button"
                        class="shrink-0 rounded text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                        aria-label="close"
                        @click="remove(toast.id)"
                    >
                        <svg-icon type="mdi" :path="mdiClose" :size="16" />
                    </button>
                </div>
            </TransitionGroup>
        </div>
    </Teleport>
</template>
