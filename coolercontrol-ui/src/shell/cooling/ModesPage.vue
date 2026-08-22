<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiBookmarkCheck, mdiBookmarkMinusOutline, mdiBookmarkMultipleOutline } from '@mdi/js'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { useToolWizards } from '@/composables/useToolWizards.ts'
import UiButton from '@/shell/ui/UiButton.vue'

const { t } = useI18n()
const settingsStore = useSettingsStore()
const { openModeWizard } = useToolWizards()

const activate = async (modeUID: string): Promise<void> => {
    await settingsStore.activateMode(modeUID)
}
</script>

<template>
    <div class="flex h-full flex-col overflow-y-auto p-4">
        <div class="flex items-center justify-between">
            <h1 class="text-xl font-semibold text-text-color">{{ t('layout.shell.modes') }}</h1>
            <UiButton variant="outline" @click="openModeWizard()">
                {{ t('views.modes.createMode') }}
            </UiButton>
        </div>
        <div v-if="settingsStore.modes.length > 0" class="mt-4 flex flex-col gap-2">
            <!-- The whole row opens the mode, as the cooling cards do. Activate
                 sits inside it, so it stops the click from following the link.
                 The active row carries no Activate button, and the height it
                 gives the others (min-h-14: py-2 either side of a 2.5rem
                 button) is held so the list does not step. -->
            <RouterLink
                v-for="mode in settingsStore.modes"
                :key="mode.uid"
                :to="{ name: 'modes', params: { modeUID: mode.uid } }"
                class="flex min-h-14 items-center gap-3 rounded-lg border border-border-one bg-bg-two px-3 py-2 outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
            >
                <svg-icon
                    type="mdi"
                    :path="
                        mode.uid === settingsStore.modeActiveCurrent
                            ? mdiBookmarkCheck
                            : mode.uid === settingsStore.modeActivePrevious
                              ? mdiBookmarkMinusOutline
                              : mdiBookmarkMultipleOutline
                    "
                    :size="18"
                    :class="
                        mode.uid === settingsStore.modeActiveCurrent
                            ? 'text-accent'
                            : 'text-text-color-secondary'
                    "
                />
                <span class="truncate text-text-color">{{ mode.name }}</span>
                <span
                    v-if="mode.uid === settingsStore.modeActiveCurrent"
                    class="text-sm text-accent"
                >
                    {{ t('layout.shell.coolingPage.activeMode') }}
                </span>
                <span
                    v-else-if="mode.uid === settingsStore.modeActivePrevious"
                    class="text-sm text-text-color-secondary"
                >
                    {{ t('layout.shell.coolingPage.previousMode') }}
                </span>
                <UiButton
                    v-if="mode.uid !== settingsStore.modeActiveCurrent"
                    variant="outline"
                    class="ml-auto"
                    @click.stop.prevent="activate(mode.uid)"
                >
                    {{ t('layout.shell.coolingPage.activate') }}
                </UiButton>
            </RouterLink>
        </div>
        <div v-else class="flex flex-1 items-center justify-center text-text-color-secondary">
            {{ t('layout.shell.coolingPage.noModes') }}
        </div>
    </div>
</template>
