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
import { mdiClose, mdiCursorMove, mdiInformationOutline } from '@mdi/js'
import * as echarts from 'echarts/core'
import type { ElementEvent } from 'echarts/core'
import { GraphicComponent, GridComponent, MarkLineComponent } from 'echarts/components'
import { LineChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import { storeToRefs } from 'pinia'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useThemeColorsStore } from '@/stores/ThemeColorsStore.ts'
import UiTooltip from '@/shell/ui/UiTooltip.vue'

echarts.use([GraphicComponent, GridComponent, MarkLineComponent, LineChart, CanvasRenderer])

export interface GraphTempSource {
    deviceUID: string
    tempName: string
    color: string
    tempMin: number
    tempMax: number
}

const props = defineProps<{
    points: Array<[number, number]>
    tempSource?: GraphTempSource
    dutyMin: number
    dutyMax: number
    minPoints: number
    maxPoints: number
}>()
const emit = defineEmits<{ (e: 'changed', points: Array<[number, number]>): void }>()

const MIN_TEMP_SEPARATION = 0.1

const { t } = useI18n()
const deviceStore = useDeviceStore()
const themeColors = useThemeColorsStore()
const { currentDeviceStatus } = storeToRefs(deviceStore)

const chart = ref<InstanceType<typeof VChart>>()
const localPoints = ref<Array<[number, number]>>(props.points.map((p) => [p[0], p[1]]))

const axisMin = (): number => props.tempSource?.tempMin ?? 0
const axisMax = (): number => props.tempSource?.tempMax ?? 100
const lineColor = (): string => props.tempSource?.color || themeColors.themeColors.accent

const option = {
    grid: { left: 45, right: 20, top: 15, bottom: 30 },
    xAxis: {
        type: 'value',
        min: axisMin(),
        max: axisMax(),
        axisLabel: {
            color: themeColors.themeColors.text_color_secondary,
            formatter: `{value}${t('common.tempUnit')}`,
        },
        splitLine: { lineStyle: { color: themeColors.themeColors.border, opacity: 0.4 } },
    },
    yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: {
            color: themeColors.themeColors.text_color_secondary,
            formatter: '{value}%',
        },
        splitLine: { lineStyle: { color: themeColors.themeColors.border, opacity: 0.4 } },
    },
    series: [
        {
            id: 'curve',
            type: 'line',
            animation: false,
            symbol: 'circle',
            symbolSize: 10,
            itemStyle: { color: lineColor() },
            lineStyle: { color: lineColor(), width: 2 },
            data: [] as Array<[number, number]>,
        },
        {
            id: 'temp',
            type: 'line',
            animation: false,
            data: [],
            markLine: {
                symbol: 'none',
                silent: true,
                animation: false,
                label: { show: false },
                lineStyle: { color: lineColor(), type: 'dashed', width: 1 },
                data: [] as Array<{ xAxis: number }>,
            },
        },
    ],
    animation: false,
}

const round1 = (value: number): number => Math.round(value * 10) / 10

// Constrains a point between its neighbors: temps stay separated and ordered,
// duties stay monotonic (non-decreasing), matching the legacy editor rules.
const clampPoint = (index: number, temp: number, duty: number): [number, number] => {
    const points = localPoints.value
    const prevTemp = index > 0 ? points[index - 1][0] + MIN_TEMP_SEPARATION : axisMin()
    const nextTemp =
        index < points.length - 1 ? points[index + 1][0] - MIN_TEMP_SEPARATION : axisMax()
    const clampedTemp = round1(Math.min(Math.max(temp, prevTemp), nextTemp))
    let clampedDuty = Math.round(Math.min(Math.max(duty, props.dutyMin), props.dutyMax))
    if (index > 0) clampedDuty = Math.max(clampedDuty, points[index - 1][1])
    if (index < points.length - 1) clampedDuty = Math.min(clampedDuty, points[index + 1][1])
    return [clampedTemp, clampedDuty]
}

const refreshSeries = (): void => {
    chart.value?.setOption({
        series: [{ id: 'curve', data: localPoints.value.map((p) => [p[0], p[1]]) }],
    })
}

const graphicIds: string[] = []
const syncGraphics = (): void => {
    if (chart.value == null) return
    // No graphic for the last point: it is pinned to the axis end (legacy rule).
    const draggableCount = Math.max(localPoints.value.length - 1, 0)
    const graphics: object[] = localPoints.value
        .slice(0, draggableCount)
        .map((point, dataIndex) => ({
            id: `pt-${dataIndex}`,
            type: 'circle',
            position: chart.value?.convertToPixel('grid', point),
            shape: { cx: 0, cy: 0, r: 12 },
            invisible: true,
            draggable: true,
            z: 100,
            ondrag: function (this: { x: number; y: number }) {
                onPointDrag(dataIndex, this.x, this.y)
            },
            ondragend: function (this: { x: number; y: number }) {
                onPointDrag(dataIndex, this.x, this.y)
                afterEdit()
            },
        }))
    for (const staleId of graphicIds.slice(draggableCount)) {
        graphics.push({ id: staleId, $action: 'remove' })
    }
    graphicIds.length = 0
    for (let i = 0; i < draggableCount; i++) graphicIds.push(`pt-${i}`)
    chart.value.setOption({ graphic: graphics })
}

const onPointDrag = (dataIndex: number, pixelX: number, pixelY: number): void => {
    const posXY = chart.value?.convertFromPixel('grid', [pixelX, pixelY]) as
        | [number, number]
        | undefined
    if (posXY == null) return
    localPoints.value[dataIndex] = clampPoint(dataIndex, posXY[0], posXY[1])
    refreshSeries()
}

const afterEdit = (): void => {
    refreshSeries()
    nextTick(() => syncGraphics())
    emit(
        'changed',
        localPoints.value.map((p) => [p[0], p[1]]),
    )
}

const onInputChange = (index: number, temp: number, duty: number): void => {
    localPoints.value[index] = clampPoint(index, temp, duty)
    afterEdit()
}

// Left-click on the line inserts a point at the click position.
const onZrClick = (params: ElementEvent): void => {
    if ((params.target as { type?: string } | undefined)?.type !== 'ec-polyline') return
    if (localPoints.value.length >= props.maxPoints) return
    const posXY = chart.value?.convertFromPixel('grid', [params.offsetX, params.offsetY]) as
        | [number, number]
        | undefined
    if (posXY == null) return
    const points = localPoints.value
    let insertAt = points.length - 1
    for (const [i, point] of points.entries()) {
        if (point[0] > posXY[0]) {
            insertAt = i
            break
        }
    }
    if (insertAt <= 0) insertAt = 1
    const prev = points[insertAt - 1]
    const next = points[insertAt]
    const temp = round1(
        Math.min(Math.max(posXY[0], prev[0] + MIN_TEMP_SEPARATION), next[0] - MIN_TEMP_SEPARATION),
    )
    if (temp <= prev[0] || temp >= next[0]) return
    const duty = Math.round(Math.min(Math.max(posXY[1], prev[1]), next[1]))
    points.splice(insertAt, 0, [temp, duty])
    afterEdit()
}

// Right-click on a point removes it (never the first or last point).
const onZrContextmenu = (params: ElementEvent): void => {
    params.stop()
    ;(params.event as Event | undefined)?.preventDefault?.()
    if (localPoints.value.length <= props.minPoints) return
    if (chart.value == null) return
    for (let i = 1; i < localPoints.value.length - 1; i++) {
        const pixel = chart.value.convertToPixel('grid', localPoints.value[i]) as
            | [number, number]
            | undefined
        if (pixel == null) continue
        const distance = Math.hypot(pixel[0] - params.offsetX, pixel[1] - params.offsetY)
        if (distance <= 14) {
            removePoint(i)
            return
        }
    }
}

const removePoint = (index: number): void => {
    if (localPoints.value.length <= props.minPoints) return
    if (index === 0 || index === localPoints.value.length - 1) return
    localPoints.value.splice(index, 1)
    afterEdit()
}

const setTempMarkLine = (): void => {
    if (props.tempSource == null) return
    const temp = currentDeviceStatus.value
        .get(props.tempSource.deviceUID)
        ?.get(props.tempSource.tempName)?.temp
    if (temp == null) return
    chart.value?.setOption({
        series: [{ id: 'temp', markLine: { data: [{ xAxis: Number(temp) }] } }],
    })
}
watch(currentDeviceStatus, setTempMarkLine)

watch(
    () => props.points,
    (newPoints) => {
        localPoints.value = newPoints.map((p) => [p[0], p[1]])
        refreshSeries()
        nextTick(() => syncGraphics())
    },
)

watch(
    () => props.tempSource,
    () => {
        chart.value?.setOption({
            xAxis: { min: axisMin(), max: axisMax() },
            series: [
                {
                    id: 'curve',
                    itemStyle: { color: lineColor() },
                    lineStyle: { color: lineColor() },
                },
                { id: 'temp', markLine: { lineStyle: { color: lineColor() } } },
            ],
        })
        nextTick(() => syncGraphics())
    },
)

// Floating points-table overlay, repositionable like the legacy editor.
const tablePosition = ref<'top-left' | 'bottom-right'>('top-left')
const cycleTablePosition = (): void => {
    tablePosition.value = tablePosition.value === 'top-left' ? 'bottom-right' : 'top-left'
}

const wrapper = ref<HTMLElement>()
let resizeObserver: ResizeObserver | null = null
onMounted(() => {
    chart.value?.setOption(option)
    refreshSeries()
    setTempMarkLine()
    nextTick(() => syncGraphics())
    if (wrapper.value != null) {
        resizeObserver = new ResizeObserver(() => {
            chart.value?.resize()
            syncGraphics()
        })
        resizeObserver.observe(wrapper.value)
    }
})
onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
})
</script>

<template>
    <div ref="wrapper" class="relative">
        <div @contextmenu.prevent>
            <v-chart
                ref="chart"
                class="h-96 w-full"
                :option="option"
                :manual-update="true"
                @zr:click="onZrClick"
                @zr:contextmenu="onZrContextmenu"
            />
        </div>
        <div class="absolute right-2 top-2 z-10 text-text-color-secondary">
            <UiTooltip :text="t('views.profiles.graphProfileMouseActions')" side="left">
                <span>
                    <svg-icon type="mdi" :path="mdiInformationOutline" :size="18" />
                </span>
            </UiTooltip>
        </div>
        <div
            class="absolute z-10 max-h-80 overflow-y-auto rounded-lg border border-border-one bg-bg-two/90 shadow-lg"
            :class="tablePosition === 'top-left' ? 'left-14 top-4' : 'bottom-12 right-8'"
        >
            <div
                class="sticky top-0 flex items-center justify-between gap-3 border-b border-border-one bg-bg-two/95 px-2 py-1"
            >
                <span class="text-xs uppercase text-text-color-secondary">
                    {{ t('layout.shell.coolingPage.points') }}
                </span>
                <button
                    type="button"
                    class="rounded p-0.5 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                    :title="t('layout.shell.coolingPage.movePointsTable')"
                    @click="cycleTablePosition"
                >
                    <svg-icon type="mdi" :path="mdiCursorMove" :size="14" />
                </button>
            </div>
            <div
                v-for="(point, index) in localPoints"
                :key="index"
                class="flex items-center gap-1 px-2 py-0.5 text-sm"
            >
                <input
                    type="number"
                    :value="point[0]"
                    step="0.1"
                    class="w-14 bg-transparent text-right tabular-nums text-text-color outline-none"
                    @change="
                        (e) =>
                            onInputChange(
                                index,
                                Number((e.target as HTMLInputElement).value),
                                point[1],
                            )
                    "
                />
                <span class="text-text-color-secondary">{{ t('common.tempUnit') }}</span>
                <input
                    type="number"
                    :value="point[1]"
                    step="1"
                    class="w-12 bg-transparent text-right tabular-nums text-text-color outline-none"
                    @change="
                        (e) =>
                            onInputChange(
                                index,
                                point[0],
                                Number((e.target as HTMLInputElement).value),
                            )
                    "
                />
                <span class="text-text-color-secondary">%</span>
                <button
                    type="button"
                    class="ml-1 rounded p-0.5 text-text-color-secondary outline-none hover:text-error focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-30"
                    :disabled="
                        index === 0 ||
                        index === localPoints.length - 1 ||
                        localPoints.length <= minPoints
                    "
                    :title="t('layout.shell.coolingPage.removePoint')"
                    @click="removePoint(index)"
                >
                    <svg-icon type="mdi" :path="mdiClose" :size="14" />
                </button>
            </div>
        </div>
    </div>
</template>
