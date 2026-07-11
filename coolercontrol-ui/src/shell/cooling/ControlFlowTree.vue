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
import { mdiChartMultiple, mdiFunction, mdiThermometer } from '@mdi/js'
import type { FlowRow } from '@/shell/cooling/controlFlow.ts'

defineProps<{ rows: Array<FlowRow> }>()

const rowIcon = (kind: FlowRow['kind']): string => {
    switch (kind) {
        case 'tempSource':
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
        class="flex w-fit flex-col gap-1 rounded-lg border border-border-one bg-bg-two p-2.5 text-sm"
    >
        <div
            v-for="(row, index) in rows"
            :key="`${row.kind}-${index}`"
            class="flex items-center gap-1.5 text-text-color"
            :style="{ paddingLeft: `${row.depth * 1.25}rem` }"
        >
            <svg-icon
                type="mdi"
                :path="rowIcon(row.kind)"
                :size="14"
                class="shrink-0 text-text-color-secondary"
            />
            <span class="truncate">{{ row.label }}</span>
            <span v-if="row.detail" class="shrink-0 text-xs text-text-color-secondary">
                {{ row.detail }}
            </span>
        </div>
    </div>
</template>
