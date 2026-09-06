<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// Shows the hardware support report before it leaves the machine. The user
// reads exactly what they are about to paste; nothing is sent anywhere by the
// app itself. The daemon excludes serials and uuids when building the text.
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon'
import { mdiLoading } from '@mdi/js'
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

// Toggling compact/full twice in quick succession can have the first request
// resolve last, which would leave the preview showing the variant the switch is
// no longer set to. Only the newest request may write.
let requestId = 0

async function load(): Promise<void> {
    const thisRequest = ++requestId
    loading.value = true
    copied.value = false
    const loaded = await deviceStore.daemonClient.loadHardwareReport(full.value)
    if (thisRequest !== requestId) return
    report.value = loaded
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
                >{{ report || t('views.appInfo.hardwareReportEmpty') }}</pre>
            <div v-else class="flex items-center gap-2 p-3 text-base text-text-color-secondary">
                <svg-icon type="mdi" :path="mdiLoading" :size="20" class="animate-spin" />
                {{ t('common.loading') }}
            </div>
        </div>
    </UiModal>
</template>
