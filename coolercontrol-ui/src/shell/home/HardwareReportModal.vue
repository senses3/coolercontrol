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
// Shows the hardware support report before it leaves the machine. The user
// reads exactly what they are about to paste; nothing is sent anywhere by the
// app itself. The daemon excludes serials and uuids when building the text.
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import UiModal from '@/shell/ui/UiModal.vue'
import UiButton from '@/shell/ui/UiButton.vue'
import UiSwitch from '@/shell/ui/UiSwitch.vue'
import { useDeviceStore } from '@/stores/DeviceStore.ts'

const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const deviceStore = useDeviceStore()

// Discord and every markdown editor collapse the column alignment unless the
// text is a code block, so the copy wraps it. The daemon reserves room for
// these in its paste budget, so a fenced compact report still fits the limit.
const CODE_FENCE = '```'

const report = ref('')
const loading = ref(false)
const full = ref(false)
const copied = ref(false)

async function load(): Promise<void> {
    loading.value = true
    copied.value = false
    report.value = await deviceStore.daemonClient.loadHardwareReport(full.value)
    loading.value = false
}

// Reload when opened and whenever the compact/full choice changes, so the
// preview always shows the text the copy button will put on the clipboard. The
// fences are the one difference, and they are formatting rather than content.
watch(open, (isOpen) => {
    if (isOpen) void load()
})
watch(full, () => {
    if (open.value) void load()
})

async function copy(): Promise<void> {
    try {
        // trimEnd first: the report ends in a newline, which would otherwise
        // put a blank line inside the block.
        await navigator.clipboard.writeText(
            `${CODE_FENCE}\n${report.value.trimEnd()}\n${CODE_FENCE}`,
        )
        copied.value = true
    } catch {
        // Clipboard access can be denied; the text is on screen and
        // selectable, so this is not worth interrupting the user for.
        copied.value = false
    }
}
</script>

<template>
    <UiModal
        v-model:open="open"
        :title="t('views.appInfo.hardwareReport')"
        :description="t('views.appInfo.hardwareReportDescription')"
        :content-style="{ width: '60vw' }"
    >
        <div class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center gap-4">
                <label class="flex items-center gap-2 text-base text-text-color">
                    <UiSwitch v-model="full" />
                    {{ t('views.appInfo.hardwareReportFull') }}
                </label>
                <UiButton class="ml-auto" :disabled="loading || !report" @click="copy">
                    {{
                        copied
                            ? t('views.appInfo.hardwareReportCopied')
                            : t('views.appInfo.hardwareReportCopy')
                    }}
                </UiButton>
            </div>
            <pre
                v-if="!loading"
                class="max-h-[60vh] overflow-auto rounded-lg bg-bg-two p-3 text-sm text-text-color"
                >{{ report || t('views.appInfo.hardwareReportEmpty') }}</pre
            >
            <div v-else class="p-3 text-base text-text-color-secondary">
                {{ t('common.loading') }}
            </div>
        </div>
    </UiModal>
</template>
