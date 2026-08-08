<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { currentConfirm } from '@/shell/confirm'
import UiModal from '@/shell/ui/UiModal.vue'
import UiButton from '@/shell/ui/UiButton.vue'

const { t } = useI18n()

// Each mounted dialog serves one group; the default one (no group prop) serves
// ungrouped confirms.
const props = defineProps<{ group?: string }>()

const active = computed(() =>
    currentConfirm.value != null &&
    (currentConfirm.value.group ?? undefined) === (props.group ?? undefined)
        ? currentConfirm.value
        : null,
)

// Resolve once: accept/reject callbacks fire at most once (dismiss counts as reject).
const finish = (which: 'accept' | 'reject'): void => {
    const confirmation = currentConfirm.value
    if (confirmation == null) return
    currentConfirm.value = null
    if (which === 'accept') confirmation.accept?.()
    else confirmation.reject?.()
}

const open = computed<boolean>({
    get: () => active.value != null,
    set: (value) => {
        if (!value) finish('reject')
    },
})
</script>

<template>
    <UiModal v-if="active" v-model:open="open" :title="active.header" content-class="min-w-80">
        <slot name="message" :message="active">
            <div class="flex flex-col items-center">
                <svg-icon
                    v-if="active.icon"
                    type="mdi"
                    :path="active.icon"
                    :size="36"
                    class="mb-2 text-text-color-secondary"
                />
                <p class="max-w-96 whitespace-pre-line text-center">{{ active.message }}</p>
            </div>
        </slot>
        <div class="mt-6 flex justify-end gap-3">
            <UiButton
                variant="outline"
                :autofocus="active.defaultFocus === 'reject'"
                @click="finish('reject')"
            >
                {{ active.rejectLabel ?? t('common.no') }}
            </UiButton>
            <UiButton
                variant="solid"
                :autofocus="active.defaultFocus !== 'reject'"
                :class="active.acceptClass"
                @click="finish('accept')"
            >
                {{ active.acceptLabel ?? t('common.yes') }}
            </UiButton>
        </div>
    </UiModal>
</template>
