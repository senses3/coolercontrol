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
                <i
                    v-if="active.icon"
                    class="mb-2 text-4xl text-text-color-secondary"
                    :class="active.icon"
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
