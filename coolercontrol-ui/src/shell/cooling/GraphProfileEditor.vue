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
import { mdiClose, mdiPlus } from '@mdi/js'
import * as echarts from 'echarts/core'
import { GraphicComponent, GridComponent, MarkLineComponent } from 'echarts/components'
import { LineChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import { storeToRefs } from 'pinia'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useThemeColorsStore } from '@/stores/ThemeColorsStore.ts'

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

const clampPoint = (index: number, temp: number, duty: number): [number, number] => {
    const prevTemp = index > 0 ? localPoints.value[index - 1][0] + 0.1 : axisMin()
    const nextTemp =
        index < localPoints.value.length - 1 ? localPoints.value[index + 1][0] - 0.1 : axisMax()
    const clampedTemp = round1(Math.min(Math.max(temp, prevTemp), nextTemp))
    const clampedDuty = Math.round(Math.min(Math.max(duty, props.dutyMin), props.dutyMax))
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
    const graphics: object[] = localPoints.value.map((point, dataIndex) => ({
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
    // remove stale graphics after a point deletion
    for (const staleId of graphicIds.slice(localPoints.value.length)) {
        graphics.push({ id: staleId, $action: 'remove' })
    }
    graphicIds.length = 0
    graphicIds.push(...localPoints.value.map((_, i) => `pt-${i}`))
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

const addPoint = (): void => {
    if (localPoints.value.length >= props.maxPoints) return
    // insert into the largest temperature gap
    let gapIndex = 0
    let largestGap = 0
    for (let i = 0; i < localPoints.value.length - 1; i++) {
        const gap = localPoints.value[i + 1][0] - localPoints.value[i][0]
        if (gap > largestGap) {
            largestGap = gap
            gapIndex = i
        }
    }
    const left = localPoints.value[gapIndex]
    const right = localPoints.value[gapIndex + 1]
    localPoints.value.splice(gapIndex + 1, 0, [
        round1((left[0] + right[0]) / 2),
        Math.round((left[1] + right[1]) / 2),
    ])
    afterEdit()
}

const removePoint = (index: number): void => {
    if (localPoints.value.length <= props.minPoints) return
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

const wrapper = ref<HTMLElement>()
let resizeObserver: ResizeObserver | null = null
onMounted(() => {
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
    <div ref="wrapper" class="flex flex-col gap-3">
        <v-chart ref="chart" class="h-72 w-full" :option="option" />
        <div class="flex flex-wrap items-center gap-2">
            <div
                v-for="(point, index) in localPoints"
                :key="index"
                class="flex items-center gap-1 rounded-lg border border-border-one bg-bg-two px-2 py-1 text-sm"
            >
                <input
                    type="number"
                    :value="point[0]"
                    step="0.1"
                    class="w-16 bg-transparent text-right tabular-nums text-text-color outline-none"
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
                    class="ml-1 rounded p-0.5 text-text-color-secondary outline-none hover:text-error focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40"
                    :disabled="localPoints.length <= minPoints"
                    :title="t('layout.shell.coolingPage.removePoint')"
                    @click="removePoint(index)"
                >
                    <svg-icon type="mdi" :path="mdiClose" :size="14" />
                </button>
            </div>
            <button
                type="button"
                class="flex items-center gap-1 rounded-lg border border-dashed border-border-one px-2 py-1 text-sm text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40"
                :disabled="localPoints.length >= maxPoints"
                @click="addPoint"
            >
                <svg-icon type="mdi" :path="mdiPlus" :size="14" />
                {{ t('layout.shell.coolingPage.addPoint') }}
            </button>
        </div>
    </div>
</template>
