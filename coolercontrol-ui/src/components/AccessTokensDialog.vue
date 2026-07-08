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
import { computed, onMounted, ref, type Ref } from 'vue'
import { useDeviceStore } from '@/stores/DeviceStore'
import { useSettingsStore } from '@/stores/SettingsStore'
import { useConfirm } from '@/shell/confirm'
import { useToast } from '@/shell/toast'
import { useI18n } from 'vue-i18n'
import { ErrorResponse } from '@/models/ErrorResponse'
import type { AccessTokenInfo, CreateTokenResponse } from '@/models/AccessToken'
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiAlertOutline, mdiClose, mdiContentCopy, mdiPlus, mdiTrashCanOutline } from '@mdi/js'
import UiSwitch from '@/shell/ui/UiSwitch.vue'
import UiButton from '@/shell/ui/UiButton.vue'
import UiInput from '@/shell/ui/UiInput.vue'
import UiTable from '@/shell/ui/UiTable.vue'
import UiTag from '@/shell/ui/UiTag.vue'

const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const confirm = useConfirm()
const toast = useToast()
const { t, locale } = useI18n()

const tokens: Ref<AccessTokenInfo[]> = ref([])
const newLabel: Ref<string> = ref('')
const newExpiry: Ref<Date | null> = ref(null)
const newWriteAccess: Ref<boolean> = ref(false)
const createdToken: Ref<CreateTokenResponse | null> = ref(null)
const loading: Ref<boolean> = ref(false)

async function loadTokens(): Promise<void> {
    loading.value = true
    const result = await deviceStore.daemonClient.listTokens()
    loading.value = false
    if (result instanceof ErrorResponse) {
        toast.add({
            severity: 'error',
            summary: t('common.error'),
            detail: t('auth.tokenLoadError'),
            life: 5000,
        })
        return
    }
    tokens.value = result
}

async function createToken(): Promise<void> {
    const label = newLabel.value.trim()
    if (!label) return
    const expiresAt = newExpiry.value ? newExpiry.value.toISOString() : null
    const result = await deviceStore.daemonClient.createToken(
        label,
        expiresAt,
        newWriteAccess.value,
    )
    if (result instanceof ErrorResponse) {
        toast.add({
            severity: 'error',
            summary: t('common.error'),
            detail: result.error || t('auth.tokenCreateError'),
            life: 5000,
        })
        return
    }
    createdToken.value = result
    newLabel.value = ''
    newExpiry.value = null
    newWriteAccess.value = false
    await loadTokens()
}

async function deleteToken(tokenId: string): Promise<void> {
    confirm.require({
        message: t('auth.tokenDeleteConfirm'),
        header: t('auth.tokenDeleteHeader'),
        icon: mdiAlertOutline,
        acceptClass: '!bg-red-500 hover:!bg-red-600',
        accept: async () => {
            const result = await deviceStore.daemonClient.deleteToken(tokenId)
            if (result instanceof ErrorResponse) {
                toast.add({
                    severity: 'error',
                    summary: t('common.error'),
                    detail: t('auth.tokenDeleteError'),
                    life: 5000,
                })
                return
            }
            toast.add({
                severity: 'success',
                summary: t('common.success'),
                detail: t('auth.tokenDeleted'),
                life: 3000,
            })
            await loadTokens()
        },
    })
}

function copyToken(): void {
    if (!createdToken.value) return
    const text = createdToken.value.token
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
    } else {
        fallbackCopy(text)
    }
    toast.add({
        severity: 'info',
        summary: t('auth.tokenCopied'),
        life: 2000,
    })
}

function fallbackCopy(text: string): void {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return t('auth.never')
    const options: Intl.DateTimeFormatOptions = settingsStore.time24 ? { hour12: false } : {}
    return new Date(dateStr).toLocaleString(undefined, options)
}

function isExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return false
    return new Date(expiresAt) <= new Date()
}

function expiryStatus(expiresAt: string | null): { label: string; severity: string } {
    if (!expiresAt) return { label: t('auth.never'), severity: 'info' }
    if (isExpired(expiresAt)) return { label: t('auth.expired'), severity: 'danger' }
    return { label: t('auth.active'), severity: 'success' }
}

// Bridge the Date model to a native datetime-local input (local-time string).
const pad = (n: number): string => String(n).padStart(2, '0')
const toLocalInput = (date: Date): string =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
const nowLocal = toLocalInput(new Date())
// Date-picker locale precedence: the UI language is the ultimate decider; when it
// carries no region (e.g. plain 'en'/'de'), borrow the region from the OS locale
// as a fallback. (Chromium only exposes the OS language-locale here, not a
// separate regional-format setting, so that is the best fallback available.)
const dateLocale = computed<string>(() => {
    try {
        const ui = new Intl.Locale(locale.value)
        if (ui.region != null) return ui.baseName
        const osRegion = new Intl.Locale(Intl.DateTimeFormat().resolvedOptions().locale).region
        return osRegion != null ? `${ui.language}-${osRegion}` : ui.baseName
    } catch {
        return locale.value
    }
})
const expiryLocal = computed<string>({
    get: () => (newExpiry.value ? toLocalInput(newExpiry.value) : ''),
    set: (value) => {
        newExpiry.value = value ? new Date(value) : null
    },
})

onMounted(loadTokens)
</script>

<template>
    <!-- Created token alert -->
    <div
        v-if="createdToken"
        class="relative mb-4 rounded-lg border-l-4 border-warning bg-warning/10 p-4 pr-10 text-text-color"
    >
        <button
            type="button"
            aria-label="close"
            class="absolute right-2 top-2 rounded p-1 text-text-color-secondary outline-none hover:text-text-color"
            @click="createdToken = null"
        >
            <svg-icon type="mdi" :path="mdiClose" :size="18" />
        </button>
        <div class="flex flex-col gap-2">
            <span class="font-semibold">{{ t('auth.tokenCreated') }}</span>
            <span class="text-sm text-text-color-secondary">{{
                t('auth.tokenCreatedDetail')
            }}</span>
            <div class="flex items-center gap-2">
                <code class="break-all rounded-lg bg-bg-one px-2 py-1 text-sm">
                    {{ createdToken.token }}
                </code>
                <UiButton variant="ghost" size="icon" @click="copyToken">
                    <svg-icon type="mdi" :path="mdiContentCopy" :size="18" />
                </UiButton>
            </div>
        </div>
    </div>

    <!-- Create form -->
    <div class="mt-6 mb-4 flex items-end gap-3">
        <div class="flex-grow">
            <label for="token-label" class="mb-1 ml-1 block text-sm text-text-color-secondary">{{
                t('auth.tokenLabel')
            }}</label>
            <UiInput
                id="token-label"
                v-model="newLabel"
                class="w-full"
                @keydown.enter="createToken"
                autofocus
            />
        </div>
        <div>
            <label for="token-expiry" class="mb-1 ml-1 block text-sm text-text-color-secondary">{{
                t('auth.tokenExpiry')
            }}</label>
            <input
                id="token-expiry"
                v-model="expiryLocal"
                :lang="dateLocale"
                type="datetime-local"
                :min="nowLocal"
                class="h-10 rounded-lg border border-border-one bg-bg-one px-3 text-text-color outline-none focus:ring-2 focus:ring-accent"
            />
        </div>
        <div class="flex h-10 items-center gap-2" v-tooltip.top="t('auth.writeAccessTooltip')">
            <label for="token-write-access" class="whitespace-nowrap">
                {{ t('auth.writeAccess') }}
            </label>
            <UiSwitch v-model="newWriteAccess" input-id="token-write-access" />
        </div>
        <UiButton class="gap-1" @click="createToken" :disabled="newLabel.trim().length === 0">
            <svg-icon type="mdi" :path="mdiPlus" :size="18" />
            {{ t('auth.createToken') }}
        </UiButton>
    </div>

    <!-- Token list -->
    <UiTable bordered>
        <template #head>
            <tr>
                <th>{{ t('auth.label') }}</th>
                <th>{{ t('auth.created') }}</th>
                <th>{{ t('auth.expires') }}</th>
                <th>{{ t('auth.writeAccess') }}</th>
                <th>{{ t('auth.lastUsed') }}</th>
                <th class="w-20">{{ t('auth.actions') }}</th>
            </tr>
        </template>
        <tr v-if="loading">
            <td colspan="6" class="text-center text-text-color-secondary">
                {{ t('common.loading') }}
            </td>
        </tr>
        <tr v-else-if="tokens.length === 0">
            <td colspan="6" class="text-center text-text-color-secondary">
                {{ t('auth.noTokens') }}
            </td>
        </tr>
        <tr v-for="token in tokens" v-else :key="token.id">
            <td>{{ token.label }}</td>
            <td>{{ formatDate(token.created_at) }}</td>
            <td>
                <UiTag
                    :value="expiryStatus(token.expires_at).label"
                    :severity="expiryStatus(token.expires_at).severity as any"
                />
                <span v-if="token.expires_at" class="ml-2">{{ formatDate(token.expires_at) }}</span>
            </td>
            <td>
                <UiTag v-if="token.write_access" :value="t('common.yes')" severity="warn" />
                <UiTag v-else :value="t('common.no')" severity="success" />
            </td>
            <td>{{ token.last_used ? formatDate(token.last_used) : t('auth.neverUsed') }}</td>
            <td>
                <UiButton
                    variant="ghost"
                    size="icon"
                    class="text-error"
                    :aria-label="t('auth.actions')"
                    @click="deleteToken(token.id)"
                >
                    <svg-icon type="mdi" :path="mdiTrashCanOutline" :size="18" />
                </UiButton>
            </td>
        </tr>
    </UiTable>
</template>

<style scoped lang="scss"></style>
