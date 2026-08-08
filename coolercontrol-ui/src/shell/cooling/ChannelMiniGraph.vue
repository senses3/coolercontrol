<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UID } from '@/models/Device.ts'
import { ProfileType } from '@/models/Profile.ts'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import {
    type MiniCurveSet,
    resolveMiniCurves,
    sparklineRange,
} from '@/shell/cooling/profileCurve.ts'

// The cooling landing mini graph. Channels driven by a curve-based profile
// (Graph/Mix/Overlay) draw the assigned duty-vs-temp curve with a live
// operating dot; everything else (unmanaged, manual, Fixed profile) draws a
// live duty sparkline over the last half hour, auto-scaled so small real
// movement stays visible.

const props = defineProps<{
    deviceUID: UID
    channelName: string
    color?: string
}>()

// Plot area inside the viewBox, with headroom so dots and strokes at the
// extremes are not clipped.
const VIEW_W = 100
const VIEW_H = 32
const PLOT_TOP = 2
const PLOT_BOTTOM = VIEW_H - 2
const SPARKLINE_WINDOW = 1800

const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
// The tick ref: reading it in computeds makes the mini redraw per status update.
const { currentDeviceStatus } = storeToRefs(deviceStore)

const yFor = (duty: number, min = 0, max = 100): number =>
    PLOT_BOTTOM - ((duty - min) / (max - min)) * (PLOT_BOTTOM - PLOT_TOP)

// ----- mode -----

const assignedProfile = computed(() => {
    const setting = settingsStore.allDaemonDeviceSettings
        .get(props.deviceUID)
        ?.settings.get(props.channelName)
    if (setting?.speed_fixed != null) return undefined
    const uid = setting?.profile_uid
    if (uid == null || uid === '0') return undefined
    return settingsStore.profiles.find((profile) => profile.uid === uid)
})

const curveSet = computed<MiniCurveSet | null>(() => {
    const profile = assignedProfile.value
    if (profile == null || profile.p_type === ProfileType.Fixed) return null
    return resolveMiniCurves(profile, settingsStore.profiles)
})

// ----- curve mode -----

interface DrawnCurve {
    key: string
    points: string
    color: string
    isBase: boolean
    dot?: { x: number; y: number }
}

const sourceColor = (deviceUID: UID | undefined, tempName: string | undefined): string => {
    if (deviceUID == null || tempName == null) return props.color || 'currentColor'
    return (
        settingsStore.allUIDeviceSettings.get(deviceUID)?.sensorsAndChannels.get(tempName)?.color ||
        props.color ||
        'currentColor'
    )
}

const drawnCurves = computed<DrawnCurve[]>(() => {
    void currentDeviceStatus.value
    const set = curveSet.value
    if (set == null) return []
    const tempSpan = set.tempMax - set.tempMin
    // Mix members are told apart by their temp-source color; a single
    // curve (Graph, plain Overlay) keeps the channel color.
    const multiSource = new Set(set.curves.map((curve) => curve.tempSource?.temp_name)).size > 1
    return set.curves.map((curve, index) => {
        const color = multiSource
            ? sourceColor(curve.tempSource?.device_uid, curve.tempSource?.temp_name)
            : props.color || 'currentColor'
        const points = curve.points
            .map(([temp, duty]) => {
                const x = ((temp - set.tempMin) / tempSpan) * VIEW_W
                return `${x.toFixed(1)},${yFor(duty).toFixed(1)}`
            })
            .join(' ')
        let dot: { x: number; y: number } | undefined
        if (!curve.isBase && curve.tempSource != null) {
            const raw = currentDeviceStatus.value
                .get(curve.tempSource.device_uid)
                ?.get(curve.tempSource.temp_name)?.temp
            const temp = raw != null ? Number.parseFloat(raw) : Number.NaN
            if (!Number.isNaN(temp)) {
                const clamped = Math.min(Math.max(temp, set.tempMin), set.tempMax)
                dot = {
                    x: ((clamped - set.tempMin) / tempSpan) * VIEW_W,
                    y: yFor(curve.dutyAt(clamped)),
                }
            }
        }
        return { key: `curve-${index}`, points, color, isBase: curve.isBase, dot }
    })
})

// ----- sparkline mode (A + B) -----

const sparklinePoints = computed<string>(() => {
    void currentDeviceStatus.value
    let device = undefined
    for (const candidate of deviceStore.allDevices()) {
        if (candidate.uid === props.deviceUID) {
            device = candidate
            break
        }
    }
    if (device == null) return ''
    const duties: number[] = []
    for (const status of device.status_history) {
        const duty = status.channels.find((channel) => channel.name === props.channelName)?.duty
        if (duty != null) duties.push(duty)
    }
    const recent = duties.slice(-SPARKLINE_WINDOW)
    if (recent.length < 2) return ''
    const [min, max] = sparklineRange(recent)
    return recent
        .map((duty, index) => {
            const x = ((index / (recent.length - 1)) * VIEW_W).toFixed(1)
            return `${x},${yFor(Math.min(Math.max(duty, 0), 100), min, max).toFixed(1)}`
        })
        .join(' ')
})
</script>

<template>
    <div
        class="relative"
        v-tooltip.top="drawnCurves.length > 0 ? t('layout.shell.coolingPage.miniCurveHint') : ''"
    >
        <svg
            :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
            preserveAspectRatio="none"
            class="h-9 w-full"
            aria-hidden="true"
        >
            <template v-if="drawnCurves.length > 0">
                <line
                    :x1="0"
                    :y1="PLOT_BOTTOM"
                    :x2="VIEW_W"
                    :y2="PLOT_BOTTOM"
                    class="stroke-border-one"
                    stroke-width="1"
                    vector-effect="non-scaling-stroke"
                />
                <template v-for="curve in drawnCurves" :key="curve.key">
                    <polyline
                        :points="curve.points"
                        fill="none"
                        :stroke="curve.color"
                        :stroke-width="curve.isBase ? 1 : 1.5"
                        :stroke-dasharray="curve.isBase ? '3,3' : undefined"
                        :opacity="curve.isBase ? 0.45 : 1"
                        vector-effect="non-scaling-stroke"
                    />
                    <!-- A zero-length round-capped stroke renders as a circle
                         that non-scaling-stroke keeps undistorted. -->
                    <line
                        v-if="curve.dot != null"
                        :x1="curve.dot.x"
                        :y1="curve.dot.y"
                        :x2="curve.dot.x"
                        :y2="curve.dot.y"
                        :stroke="curve.color"
                        stroke-width="5"
                        stroke-linecap="round"
                        vector-effect="non-scaling-stroke"
                    />
                </template>
            </template>
            <polyline
                v-else
                :points="sparklinePoints"
                fill="none"
                :stroke="color || 'currentColor'"
                stroke-width="1.5"
                vector-effect="non-scaling-stroke"
            />
        </svg>
        <span
            v-if="(curveSet?.truncated ?? 0) > 0"
            class="absolute right-0 top-0 text-[10px] leading-none text-text-color-secondary"
        >
            +{{ curveSet!.truncated }}
        </span>
    </div>
</template>
