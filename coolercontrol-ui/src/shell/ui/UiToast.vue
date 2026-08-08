<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import {
    mdiAlertCircleOutline,
    mdiAlertOutline,
    mdiCheck,
    mdiCheckCircleOutline,
    mdiClose,
    mdiContentCopy,
    mdiInformationOutline,
} from '@mdi/js'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { activeToasts, type StoredToast, useToast } from '@/shell/toast'

const { t } = useI18n()
const { remove, removeAll, pauseAll, resumeAll } = useToast()

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

// Copy is offered on the diagnostic severities, where the detail text is worth
// keeping (API errors, warnings).
const isDiagnostic = (severity: string | undefined): boolean =>
    severity === 'error' || severity === 'danger' || severity === 'warn'

const copiedId = ref<number | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
const copy = async (toast: StoredToast): Promise<void> => {
    const text = [toast.summary, toast.detail].filter(Boolean).join('\n')
    try {
        await navigator.clipboard.writeText(text)
        copiedId.value = toast.id
        clearTimeout(copiedTimer)
        copiedTimer = setTimeout(() => (copiedId.value = null), 1500)
    } catch {
        // Clipboard is unavailable in insecure contexts; the text stays
        // selectable, so no fallback is needed.
    }
}
</script>

<template>
    <Teleport to="body">
        <div
            class="pointer-events-none fixed left-1/2 top-4 z-[1400] flex -translate-x-1/2 flex-col items-center"
        >
            <!-- The stack scrolls within the viewport instead of growing off
                 screen, and hover/focus pauses every countdown. -->
            <div
                v-if="activeToasts.length > 0"
                class="pointer-events-auto flex max-h-[calc(100vh-5rem)] w-[24rem] max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-y-auto"
                @mouseenter="pauseAll"
                @mouseleave="resumeAll"
                @focusin="pauseAll"
                @focusout="resumeAll"
            >
                <button
                    v-if="activeToasts.length > 1"
                    type="button"
                    class="shrink-0 self-end rounded px-2 py-0.5 text-xs text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                    @click="removeAll"
                >
                    {{ t('layout.shell.toast.dismissAll') }}
                </button>
                <TransitionGroup
                    enter-active-class="transition duration-200 ease-out"
                    enter-from-class="-translate-y-2 opacity-0"
                    leave-active-class="transition duration-150 ease-in"
                    leave-to-class="opacity-0"
                >
                    <div
                        v-for="toast in activeToasts"
                        :key="toast.id"
                        class="flex shrink-0 items-start gap-3 rounded-lg border border-l-4 border-border-one bg-bg-two p-3 shadow-md"
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
                            <div
                                v-if="toast.detail"
                                class="whitespace-pre-line break-words text-sm text-text-color-secondary"
                            >
                                {{ toast.detail }}
                            </div>
                        </div>
                        <div class="flex shrink-0 items-center gap-1">
                            <button
                                v-if="isDiagnostic(toast.severity)"
                                type="button"
                                class="rounded text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                                :aria-label="t('layout.shell.toast.copy')"
                                v-tooltip.top="t('layout.shell.toast.copy')"
                                @click="copy(toast)"
                            >
                                <svg-icon
                                    type="mdi"
                                    :path="copiedId === toast.id ? mdiCheck : mdiContentCopy"
                                    :size="16"
                                    :class="copiedId === toast.id ? 'text-success' : ''"
                                />
                            </button>
                            <button
                                type="button"
                                class="rounded text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                                aria-label="close"
                                @click="remove(toast.id)"
                            >
                                <svg-icon type="mdi" :path="mdiClose" :size="16" />
                            </button>
                        </div>
                    </div>
                </TransitionGroup>
            </div>
        </div>
    </Teleport>
</template>
