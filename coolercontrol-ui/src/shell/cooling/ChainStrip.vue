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

export interface ChainPill {
    kind: 'tempSource' | 'profile' | 'function'
    label: string
}

defineProps<{
    channelLabel: string
    pills: ChainPill[]
    expandable?: boolean
    expanded?: boolean
}>()
const emit = defineEmits<{
    (e: 'pill-click', kind: ChainPill['kind']): void
    (e: 'toggle-expand'): void
}>()
const { t } = useI18n()

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
        <template v-for="(pill, index) in pills" :key="`${pill.kind}-${index}`">
            <button
                type="button"
                class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border-one bg-bg-two px-2.5 py-1 text-text-color outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
                v-tooltip.top="t(`layout.shell.coolingPage.chain.${pill.kind}`)"
                @click="emit('pill-click', pill.kind)"
            >
                <svg-icon type="mdi" :path="pillIcon(pill.kind)" :size="14" />
                <span class="max-w-40 truncate">{{ pill.label }}</span>
            </button>
            <svg-icon
                type="mdi"
                :path="mdiArrowRight"
                :size="14"
                class="text-text-color-secondary"
            />
        </template>
        <span
            class="inline-flex items-center gap-1.5 rounded-full border border-accent px-2.5 py-1 text-text-color"
        >
            <svg-icon type="mdi" :path="mdiFan" :size="14" />
            <span class="max-w-40 truncate">{{ channelLabel }}</span>
        </span>
        <button
            v-if="expandable"
            type="button"
            class="inline-flex cursor-pointer items-center gap-1 rounded-full border border-accent px-2.5 py-1 text-accent outline-none transition-colors hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-accent"
            @click="emit('toggle-expand')"
        >
            <svg-icon type="mdi" :path="mdiSitemapOutline" :size="16" />
            <svg-icon type="mdi" :path="expanded ? mdiChevronUp : mdiChevronDown" :size="14" />
        </button>
    </div>
</template>
