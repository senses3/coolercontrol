<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import {
    mdiArrowRight,
    mdiChartMultiple,
    mdiChevronDown,
    mdiChevronUp,
    mdiFan,
    mdiFunction,
    mdiSitemapOutline,
    mdiThermometer,
} from '@mdi/js'
import { useI18n } from 'vue-i18n'
import type { RouteLocationRaw } from 'vue-router'

export interface ChainPill {
    kind: 'tempSource' | 'profile' | 'function'
    label: string
    to?: RouteLocationRaw
    /** The sensor's own chart color, so the chain reads as the same entity. */
    color?: string
}

defineProps<{
    channelLabel: string
    pills: ChainPill[]
    expandable?: boolean
    expanded?: boolean
}>()
const emit = defineEmits<{ (e: 'toggle-expand'): void }>()
const { t } = useI18n()

// A pill wears its sensor color as a border plus a faint wash. The wash is an
// 8-digit hex rather than color-mix(), which the Chrome 90 floor does not have.
const HEX_COLOR = /^#[0-9a-f]{6}$/i
const tintStyle = (color: string | undefined): Record<string, string> =>
    color != null && HEX_COLOR.test(color)
        ? { borderColor: color, backgroundColor: `${color}24` }
        : {}

const pillIcon = (kind: ChainPill['kind']): string => {
    switch (kind) {
        case 'tempSource':
            return mdiThermometer
        case 'profile':
            return mdiChartMultiple
        default:
            return mdiFunction
    }
}
</script>

<template>
    <div class="flex flex-wrap items-center gap-1.5 text-base">
        <button
            v-if="expandable"
            type="button"
            class="inline-flex cursor-pointer items-center gap-1 rounded-full border border-accent px-2.5 py-1 text-accent outline-none transition-colors hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-accent"
            @click="emit('toggle-expand')"
        >
            <svg-icon type="mdi" :path="mdiSitemapOutline" :size="16" />
            <svg-icon type="mdi" :path="expanded ? mdiChevronUp : mdiChevronDown" :size="14" />
        </button>
        <svg-icon
            v-if="expandable"
            type="mdi"
            :path="mdiArrowRight"
            :size="14"
            class="text-text-color-secondary"
        />
        <template v-for="(pill, index) in pills" :key="`${pill.kind}-${index}`">
            <component
                :is="pill.to ? 'RouterLink' : 'span'"
                :to="pill.to"
                class="inline-flex items-center gap-1.5 rounded-full border border-border-one bg-bg-two px-2.5 py-1 text-text-color outline-none"
                :class="
                    pill.to
                        ? 'cursor-pointer hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent'
                        : ''
                "
                :style="tintStyle(pill.color)"
                v-tooltip.top="t(`layout.shell.coolingPage.chain.${pill.kind}`)"
            >
                <svg-icon
                    type="mdi"
                    :path="pillIcon(pill.kind)"
                    :size="14"
                    :style="pill.color ? { color: pill.color } : {}"
                />
                <span class="max-w-40 truncate">{{ pill.label }}</span>
            </component>
            <svg-icon
                type="mdi"
                :path="mdiArrowRight"
                :size="14"
                class="text-text-color-secondary"
            />
        </template>
        <!-- The chain ends where control actually lands, so the fan wears the
             brand mark. The 1px pad is the border: a gradient cannot be one. -->
        <span
            class="inline-flex rounded-full bg-gradient-to-r from-accent to-accent-gradient-to p-px"
        >
            <span
                class="inline-flex items-center gap-1.5 rounded-full bg-bg-two px-2.5 py-1 text-text-color"
            >
                <svg-icon type="mdi" :path="mdiFan" :size="14" />
                <span class="max-w-40 truncate">{{ channelLabel }}</span>
            </span>
        </span>
    </div>
</template>
