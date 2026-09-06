<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiWizardHat } from '@mdi/js'
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import {
    advanceDrift,
    initialDrift,
    SAYINGS,
    SPRITE_H,
    SPRITE_W,
    wizardsActive,
    type Drift,
} from '@/shell/supportWizards.ts'

interface Wizard {
    saying: string
    drift: Drift
}

// shallowRef: the whole roster is replaced each frame, so deep reactivity would
// only buy per-field proxies nothing reads.
const wizards = shallowRef<Wizard[]>([])
let frame = 0
let lastFrameAt = 0

// They cross the entire viewport, which is the motion this query exists to
// prevent. The toast still fires, so the thank-you lands either way.
const motionAllowed = (): boolean =>
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches !== true

const stop = (): void => {
    if (frame !== 0) cancelAnimationFrame(frame)
    frame = 0
    wizards.value = []
}

const step = (now: number): void => {
    const seconds = (now - lastFrameAt) / 1000
    lastFrameAt = now
    wizards.value = wizards.value.map((wizard) => ({
        saying: wizard.saying,
        drift: advanceDrift(wizard.drift, seconds, window.innerWidth, window.innerHeight),
    }))
    frame = requestAnimationFrame(step)
}

watch(wizardsActive, (on) => {
    stop()
    if (!on || !motionAllowed()) return
    wizards.value = SAYINGS.map((saying) => ({
        saying,
        drift: initialDrift(window.innerWidth, window.innerHeight),
    }))
    lastFrameAt = performance.now()
    frame = requestAnimationFrame(step)
})

onBeforeUnmount(stop)
</script>

<template>
    <Teleport to="body">
        <!-- Decorative and inert: nothing here takes a click and none of it
             reaches a screen reader. Below the dialog layer (1200) so anything
             the user actually opened still covers them. -->
        <div
            v-for="wizard in wizards"
            :key="wizard.saying"
            aria-hidden="true"
            class="pointer-events-none fixed left-0 top-0 z-[1100] flex flex-col items-center gap-1"
            :style="{
                width: `${SPRITE_W}px`,
                height: `${SPRITE_H}px`,
                transform: `translate(${wizard.drift.x}px, ${wizard.drift.y}px)`,
            }"
        >
            <!-- The hue rides the hat alone. On the whole card it would drag
                 the label's chip off the theme background with it. -->
            <svg-icon
                type="mdi"
                :path="mdiWizardHat"
                :size="34"
                class="shrink-0 text-accent"
                :style="{ filter: `hue-rotate(${wizard.drift.hue}deg)` }"
            />
            <span
                class="rounded bg-bg-two/85 px-1.5 py-0.5 text-center text-[0.6875rem] leading-tight text-text-color-secondary"
            >
                {{ wizard.saying }}
            </span>
        </div>
    </Teleport>
</template>
