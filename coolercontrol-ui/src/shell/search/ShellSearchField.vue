<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<!-- Header trigger for the search palette. A button dressed as an input, never
     a real one: a real field would take the first keystroke, then lose it when
     the modal opened and moved focus. Collapses to an icon on mobile, where the
     header has no room. -->

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
        class="flex h-8 w-64 shrink-0 items-center gap-2 rounded-lg border border-transparent bg-surface-hover/60 px-2 text-left text-text-color-secondary outline-none transition-colors hover:border-border-one hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
        @click="openPalette"
    >
        <svg-icon type="mdi" :path="mdiMagnify" :size="deviceStore.getREMSize(1.1)" />
        <span class="flex-1 truncate text-base">{{ t('common.search') }}</span>
        <!-- Composed rather than a translated string: the modifier already has
             a key, and only the literal K is untranslatable. -->
        <span class="shrink-0 rounded border border-border-one px-1 text-xs">
            {{ t('views.shortcuts.ctrl') }} K
        </span>
    </button>
</template>
