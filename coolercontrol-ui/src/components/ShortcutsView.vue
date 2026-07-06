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
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'

const { t } = useI18n()
const deviceStore = useDeviceStore()

const ctrl = computed(() => t('views.shortcuts.ctrl'))
const rows = computed((): Array<{ label: string; keys: string[] }> => {
    const entries = [
        { label: t('views.shortcuts.viewShortcuts'), keys: [ctrl.value, '/'] },
        { label: t('layout.shell.home'), keys: [ctrl.value, '1'] },
        { label: t('layout.shell.cooling'), keys: [ctrl.value, '2'] },
        { label: t('layout.shell.monitoring'), keys: [ctrl.value, '3'] },
        { label: t('layout.shell.devices'), keys: [ctrl.value, '4'] },
        { label: t('layout.shell.settings'), keys: [ctrl.value, '5'] },
    ]
    if (deviceStore.plugins.length > 0) {
        entries.push({ label: t('layout.shell.plugins'), keys: [ctrl.value, '6'] })
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
