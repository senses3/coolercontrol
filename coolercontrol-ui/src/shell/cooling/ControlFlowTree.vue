<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiChartMultiple, mdiFunction, mdiThermometer } from '@mdi/js'
import type { FlowRow } from '@/shell/cooling/controlFlow.ts'

defineProps<{ rows: Array<FlowRow> }>()

const rowIcon = (kind: FlowRow['kind']): string => {
    switch (kind) {
        case 'tempSource':
        case 'sensor':
            return mdiThermometer
        case 'function':
            return mdiFunction
        default:
            return mdiChartMultiple
    }
}
</script>

<template>
    <div
        class="flex w-fit max-w-full flex-col rounded-lg border border-border-one bg-bg-two px-4 py-2.5 text-sm"
    >
        <div v-for="(row, index) in rows" :key="index" class="flex h-7 items-stretch">
            <!-- CSS-drawn connector lines: one fixed-width cell per depth. -->
            <span v-for="(seg, ci) in row.connectors" :key="ci" class="relative w-4 shrink-0">
                <span
                    v-if="seg === 'through' || seg === 'branch'"
                    class="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-text-color-secondary/50"
                />
                <span
                    v-else-if="seg === 'end'"
                    class="absolute left-1/2 top-0 h-1/2 w-px -translate-x-1/2 bg-text-color-secondary/50"
                />
                <span
                    v-if="seg === 'branch' || seg === 'end'"
                    class="absolute left-1/2 right-0 top-1/2 h-px -translate-y-1/2 bg-text-color-secondary/50"
                />
            </span>
            <div class="flex min-w-0 items-center gap-1.5 text-text-color">
                <svg-icon
                    type="mdi"
                    :path="rowIcon(row.kind)"
                    :size="14"
                    class="shrink-0 text-text-color-secondary"
                />
                <component
                    :is="row.to ? 'RouterLink' : 'span'"
                    :to="row.to"
                    class="truncate rounded outline-none"
                    :class="
                        row.to
                            ? 'text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent'
                            : 'text-text-color'
                    "
                    >{{ row.label }}</component
                >
                <span v-if="row.detail" class="shrink-0 text-xs text-text-color-secondary">
                    {{ row.detail }}
                </span>
            </div>
        </div>
    </div>
</template>
