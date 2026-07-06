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
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import UiButton from '@/shell/ui/UiButton.vue'

const deviceStore = useDeviceStore()
const { t } = useI18n({ useScope: 'global' })

const logContainer = ref<HTMLElement | null>(null)
const isUserScrolledUp = ref(false)

const checkIfScrolledToBottom = () => {
    if (!logContainer.value) return
    const { scrollTop, scrollHeight, clientHeight } = logContainer.value
    // Consider "at bottom" if within 5px of the bottom
    isUserScrolledUp.value = scrollHeight - scrollTop - clientHeight > 5
}

const scrollToBottom = () => {
    if (logContainer.value) {
        logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
}

watch(
    () => deviceStore.logLines,
    async () => {
        if (!isUserScrolledUp.value) {
            await nextTick()
            scrollToBottom()
        }
    },
)

const downloadLogFileName = 'coolercontrold-current.log'
const downloadLogHref = computed((): string => {
    const raw = deviceStore.logLines.map((line) => line.raw).join('\n')
    const blob = new Blob([raw], { type: 'text/plain' })
    return URL.createObjectURL(blob)
})

onMounted(() => {
    scrollToBottom()
})
</script>

<template>
    <div class="flex h-full flex-col p-4">
        <div class="flex items-center justify-between pb-3">
            <h1 class="text-xl font-semibold text-text-color">
                {{ t('views.appInfo.logsAndDiagnostics') }}
            </h1>
            <a :href="downloadLogHref" :download="downloadLogFileName">
                <UiButton size="sm" variant="outline">
                    {{ t('views.appInfo.downloadCurrentLog') }}
                </UiButton>
            </a>
        </div>
        <div
            ref="logContainer"
            class="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border-one bg-bg-two p-3 font-mono text-sm text-text-color"
            @scroll="checkIfScrolledToBottom"
        >
            <!-- Lines are escaped and highlighted once on arrival (logLines.ts). -->
            <div
                v-for="(line, index) in deviceStore.logLines"
                :key="index"
                class="whitespace-pre-wrap break-all"
                v-html="line.html"
            />
        </div>
    </div>
</template>
