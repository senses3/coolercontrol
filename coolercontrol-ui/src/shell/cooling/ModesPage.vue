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
            <UiButton size="sm" variant="outline" @click="openModeWizard()">
                {{ t('views.modes.createMode') }}
            </UiButton>
        </div>
        <div v-if="settingsStore.modes.length > 0" class="mt-4 flex flex-col gap-2">
            <div
                v-for="mode in settingsStore.modes"
                :key="mode.uid"
                class="flex items-center gap-3 rounded-lg border border-border-one bg-bg-two px-3 py-2"
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
                <RouterLink
                    :to="{ name: 'modes', params: { modeUID: mode.uid } }"
                    class="truncate text-text-color outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"
                >
                    {{ mode.name }}
                </RouterLink>
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
                    @click="activate(mode.uid)"
                >
                    {{ t('layout.shell.coolingPage.activate') }}
                </UiButton>
            </div>
        </div>
        <div v-else class="flex flex-1 items-center justify-center text-text-color-secondary">
            {{ t('layout.shell.coolingPage.noModes') }}
        </div>
    </div>
</template>
