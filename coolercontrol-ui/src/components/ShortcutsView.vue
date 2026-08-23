<!--
  SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { hotkeySections } from '@/shell/sections.ts'

const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()

const ctrl = computed(() => t('views.shortcuts.ctrl'))
// Driven by the same list ShellLayout binds, so the digits shown are the digits
// that work in the current mode.
const rows = computed((): Array<{ label: string; keys: string[] }> => {
    const entries = [{ label: t('views.shortcuts.viewShortcuts'), keys: [ctrl.value, '/'] }]
    // Simple mode has no palette, so it has no shortcut to document either.
    if (!settingsStore.isSimpleMode) {
        entries.unshift({ label: t('common.search'), keys: [ctrl.value, 'K'] })
    }
    for (const [index, section] of hotkeySections(settingsStore.uiMode).entries()) {
        if (section.id === 'plugins' && deviceStore.plugins.length === 0) continue
        entries.push({ label: t(section.labelKey), keys: [ctrl.value, String(index + 1)] })
    }
    entries.push({
        label: t('views.shortcuts.settings'),
        keys: [ctrl.value, t('views.shortcuts.comma')],
    })
    return entries
})
</script>

<template>
    <div class="text-text-color">
        <table class="w-[26rem]">
            <tbody>
                <tr v-for="row in rows" :key="row.label">
                    <td class="table-data text-end">{{ row.label }}</td>
                    <td class="table-data w-[12rem] font-bold">
                        <span
                            v-for="(key, index) in row.keys"
                            :key="key"
                            class="border-border-one border-2 rounded-lg p-0.5"
                            :class="{ 'ml-1': index > 0 }"
                        >
                            {{ key }}
                        </span>
                    </td>
                </tr>
            </tbody>
        </table>
        <p class="mt-3 text-sm text-text-color-secondary">
            {{ t('views.shortcuts.browserHint') }}
        </p>
    </div>
</template>

<style scoped>
.table-data {
    padding: 0.5rem;
}
</style>
