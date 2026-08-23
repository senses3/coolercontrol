<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<!-- Header trigger for the search palette. A button dressed as an input, never
     a real one: a real field would take the first keystroke, then lose it when
     the modal opened and moved focus. Collapses to an icon on mobile, where the
     header has no room.

     Sized to its content rather than a fixed width: it opens a modal on click
     instead of accepting text, so the wide field a real search bar needs would
     only be dead header space.

     Styled as UiButton's outline variant at size md, so it sits level with the
     Modes button beside it. bg-control rather than a tinted overlay:
     surface-hover is itself an alpha wash (and 0.25 in the high-contrast
     themes), so layering opacity on it washed the field out into a light slab. -->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiMagnify } from '@mdi/js'
import { computed } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { openPalette } from '@/shell/search/palette.ts'
import UiTooltip from '@/shell/ui/UiTooltip.vue'

const { t } = useI18n()
const deviceStore = useDeviceStore()

// Mirrors ShellLayout's breakpoint.
const { width } = useWindowSize()
const isMobile = computed(() => width.value < 768)
</script>

<template>
    <UiTooltip v-if="isMobile" :text="t('common.search')">
        <button
            id="shell-search"
            type="button"
            :aria-label="t('common.search')"
            class="flex items-center justify-center rounded-lg p-1.5 text-text-color-secondary outline-none hover:bg-surface-hover hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
            @click="openPalette"
        >
            <svg-icon type="mdi" :path="mdiMagnify" :size="deviceStore.getREMSize(1.25)" />
        </button>
    </UiTooltip>
    <button
        v-else
        id="shell-search"
        type="button"
        :aria-label="t('common.search')"
        class="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border-one bg-control px-3 text-left text-text-color-secondary outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
        @click="openPalette"
    >
        <svg-icon type="mdi" :path="mdiMagnify" :size="deviceStore.getREMSize(1.1)" />
        <span class="text-base">{{ t('common.search') }}</span>
        <!-- Composed rather than a translated string: the modifier already has
             a key, and only the literal K is untranslatable. -->
        <span class="shrink-0 rounded border border-border-one px-1 text-xs">
            {{ t('views.shortcuts.ctrl') }} K
        </span>
    </button>
</template>
