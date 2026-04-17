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
import SvgIcon from '@jamescoyle/vue-icon'
import { mdiLinkVariant } from '@mdi/js'
import { inject, Ref } from 'vue'
import type { DynamicDialogInstance } from 'primevue/dynamicdialogoptions'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { PluginDto } from '@/models/Plugins.ts'

const deviceStore = useDeviceStore()
const toast = useToast()
const { t } = useI18n()

const dialogRef: Ref<DynamicDialogInstance> = inject('dialogRef')!
const plugin: PluginDto = dialogRef.value.data.plugin
const isManaged: boolean = dialogRef.value.data.isManaged ?? false

const copyCommand = (text: string): void => {
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
    } else {
        fallbackCopy(text)
    }
    toast.add({
        severity: 'info',
        summary: t('layout.plugins.commandCopied'),
        life: 2000,
    })
}

const fallbackCopy = (text: string): void => {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
}
</script>

<template>
    <div class="flex flex-col min-w-[30vw] p-2">
        <div v-if="plugin.description" class="text-wrap italic text-text-color-secondary mb-4">
            {{ plugin.description }}
        </div>
        <table class="bg-bg-two rounded-lg w-full">
            <tbody>
                <tr class="border-b border-border-one">
                    <td class="py-3 px-4 font-semibold w-40">
                        {{ t('layout.plugins.type') }}
                    </td>
                    <td class="py-3 px-4">{{ plugin.service_type }}</td>
                </tr>
                <tr v-if="plugin.version" class="border-b border-border-one">
                    <td class="py-3 px-4 font-semibold">
                        {{ t('views.appInfo.version') }}
                    </td>
                    <td class="py-3 px-4">{{ plugin.version }}</td>
                </tr>
                <tr v-if="plugin.address" class="border-b border-border-one">
                    <td class="py-3 px-4 font-semibold">
                        {{ t('layout.plugins.address') }}
                    </td>
                    <td class="py-3 px-4">
                        <code>{{ plugin.address }}</code>
                    </td>
                </tr>
                <tr class="border-b border-border-one">
                    <td class="py-3 px-4 font-semibold">
                        {{ t('layout.plugins.privileges') }}
                    </td>
                    <td class="py-3 px-4" :class="{ 'font-bold': plugin.privileged }">
                        {{
                            plugin.privileged
                                ? t('layout.settings.plugins.privileged')
                                : t('layout.settings.plugins.restricted')
                        }}
                    </td>
                </tr>
                <tr v-if="plugin.url" :class="{ 'border-b border-border-one': isManaged }">
                    <td class="py-3 px-4 font-semibold">{{ t('layout.plugins.url') }}</td>
                    <td class="py-3 px-4">
                        <a
                            class="inline-flex items-center gap-1 underline"
                            :href="plugin.url"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <svg-icon
                                type="mdi"
                                :path="mdiLinkVariant"
                                :size="deviceStore.getREMSize(1)"
                            />
                            {{ t('layout.settings.plugins.pluginUrl') }}
                        </a>
                    </td>
                </tr>
                <tr v-if="isManaged">
                    <td class="py-3 px-4 font-semibold align-top">
                        {{ t('layout.plugins.serviceLogs') }}
                    </td>
                    <td class="py-3 px-4 space-y-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-text-color-secondary">systemd:</span>
                            <code class="ml-1 select-all"
                                >journalctl -f -u cc-plugin-{{ plugin.id }}</code
                            >
                            <i
                                class="pi pi-copy text-xs cursor-pointer opacity-60 hover:opacity-100"
                                @click="copyCommand(`journalctl -f -u cc-plugin-${plugin.id}`)"
                            />
                        </div>
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-text-color-secondary">OpenRC:</span>
                            <code class="ml-1 select-all"
                                >grep cc-plugin-{{ plugin.id }} /var/log/messages</code
                            >
                            <i
                                class="pi pi-copy text-xs cursor-pointer opacity-60 hover:opacity-100"
                                @click="
                                    copyCommand(`grep cc-plugin-${plugin.id} /var/log/messages`)
                                "
                            />
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped lang="scss"></style>
