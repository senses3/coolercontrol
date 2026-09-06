<!--
  SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<template>
    <UiSelect
        v-model="currentLanguage"
        :options="languageSelectOptions"
        :placeholder="t('layout.settings.selectLanguage')"
        :disabled="isLoading"
        class="w-full"
        @update:model-value="changeLanguage"
    />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { mdiTranslate } from '@mdi/js'
import UiSelect from '@/shell/ui/UiSelect.vue'
import { useConfirm } from '@/shell/confirm'
import { useToast } from '@/shell/toast'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { detectSystemLanguage, SYSTEM_LANGUAGE } from '@/i18n/locale.ts'

const { t } = useI18n()
const confirm = useConfirm()
const toast = useToast()
const settingsStore = useSettingsStore()
// The stored setting, which is `system` rather than the language it resolves to.
const currentLanguage = ref(settingsStore.language)
const isLoading = ref(false)

const localeOptions = [
    { name: 'English', code: 'en' },
    { name: '中文（简体）', code: 'zh' },
    { name: '中文（繁體）', code: 'zh-tw' },
    { name: '日本語', code: 'ja' },
    { name: 'Русский', code: 'ru' },
    { name: 'Deutsch', code: 'de' },
    { name: 'Français', code: 'fr' },
    { name: 'Español', code: 'es' },
    { name: 'العربية', code: 'ar' },
    { name: 'Português', code: 'pt' },
    { name: 'हिन्दी', code: 'hi' },
    { name: '한국어', code: 'ko' },
]

// Named with what it currently resolves to, so the entry is not a mystery and
// a user can see which language following the system will actually give them.
const systemLabel = computed(() => {
    const detected = detectSystemLanguage()
    const name = localeOptions.find((option) => option.code === detected)?.name ?? detected
    return `${t('layout.settings.systemLanguage')} (${name})`
})
const languageSelectOptions = computed(() => [
    { label: systemLabel.value, value: SYSTEM_LANGUAGE },
    ...localeOptions.map((option) => ({ label: option.name, value: option.code })),
])

// The store owns the setting, and it can change from elsewhere: a reload picks
// up the daemon's copy after this component has already read it.
watch(
    () => settingsStore.language,
    (setting) => {
        currentLanguage.value = setting
    },
)

function changeLanguage(value: string | undefined) {
    if (value == null || value === settingsStore.language) return

    confirm.require({
        message: t('layout.settings.languageChangeConfirmMessage'),
        header: t('layout.settings.languageChangeConfirm'),
        icon: mdiTranslate,
        acceptLabel: t('common.ok'),
        rejectLabel: t('common.cancel'),
        accept: () => {
            try {
                isLoading.value = true
                settingsStore.language = value
                settingsStore.applyLanguage()

                // Kept for the settings page, which recomputes its theme option
                // labels off this event.
                window.dispatchEvent(new CustomEvent('language-changed', { detail: value }))

                toast.add({
                    severity: 'success',
                    summary: t('common.success'),
                    detail: t('layout.settings.languageChangeSuccess'),
                    life: 3000,
                })
                isLoading.value = false
            } catch (error) {
                isLoading.value = false
                toast.add({
                    severity: 'error',
                    summary: t('common.error'),
                    detail: t('layout.settings.languageChangeError'),
                    life: 4000,
                })
            }
        },
        reject: () => {
            // Canceled, so put the select back on the stored setting.
            currentLanguage.value = settingsStore.language
        },
    })
}
</script>
