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
import { ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from 'reka-ui'
import { computed, onMounted, ref } from 'vue'
import { useEventListener, useResizeObserver } from '@vueuse/core'

// `surface` picks the colour the edge fades blend into, so the cue is seamless on
// whichever background hosts the scroll area (panels sit on bg-one, dialogs bg-two).
const props = withDefaults(defineProps<{ horizontal?: boolean; surface?: 'one' | 'two' }>(), {
    horizontal: false,
    surface: 'one',
})

const scrollbarClasses =
    'flex select-none touch-none py-2 bg-transparent transition-colors duration-[120ms] ' +
    'ease-out data-[orientation=vertical]:w-1.5 data-[orientation=horizontal]:h-1.5 ' +
    'data-[orientation=horizontal]:flex-col'

const thumbClasses =
    "flex-1 bg-text-color-secondary opacity-40 rounded-lg relative before:content-[''] " +
    'before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 ' +
    'before:-translate-y-1/2 before:w-full before:h-full before:min-w-2 before:min-h-[44px]'

// Edge fades signal that content continues above/below when the panel overflows.
const viewportRef = ref<InstanceType<typeof ScrollAreaViewport>>()
const showTopFade = ref(false)
const showBottomFade = ref(false)

const measure = (): void => {
    const el = viewportRef.value?.viewportElement
    if (el == null) return
    showTopFade.value = el.scrollTop > 1
    showBottomFade.value = el.scrollTop + el.clientHeight < el.scrollHeight - 1
}

// Scroll updates position; the two observers catch panel resize and content growth.
useEventListener(() => viewportRef.value?.viewportElement, 'scroll', measure, { passive: true })
useResizeObserver(() => viewportRef.value?.viewportElement, measure)
useResizeObserver(
    () => viewportRef.value?.viewportElement?.firstElementChild as HTMLElement | undefined,
    measure,
)
onMounted(measure)

// Hold the panel colour solid near the edge, then fade across several rows so the
// cue reads clearly rather than veiling only the last pixel. The bottom fade is
// taller so a visible band survives above the browser's link status bar, which
// overlaps the panel's lower edge.
const fadeBase =
    'pointer-events-none absolute inset-x-0 z-[1] transition-opacity duration-150 ease-out'
const fadeStops = (direction: 'top' | 'bottom'): string => {
    const surface = props.surface === 'two' ? '--colors-bg-two' : '--colors-bg-one'
    return (
        `background-image: linear-gradient(to ${direction}, rgb(var(${surface})) 0%, ` +
        `rgb(var(${surface})) 28%, rgb(var(${surface}) / 0.6) 68%, ` +
        `rgb(var(${surface}) / 0) 100%)`
    )
}
const topFadeStyle = computed(() => fadeStops('bottom'))
const bottomFadeStyle = computed(() => fadeStops('top'))
</script>

<template>
    <ScrollAreaRoot class="relative h-full w-full" type="hover" :scroll-hide-delay="100">
        <ScrollAreaViewport ref="viewportRef" class="h-full w-full">
            <slot />
        </ScrollAreaViewport>
        <!-- 1px overhang: fractional viewport heights leave the edge pixel only
             partially covered, letting a hairline of content pass through. -->
        <div
            class="-top-px h-14"
            :class="[fadeBase, showTopFade ? 'opacity-100' : 'opacity-0']"
            :style="topFadeStyle"
            aria-hidden="true"
        />
        <div
            class="-bottom-px h-28"
            :class="[fadeBase, showBottomFade ? 'opacity-100' : 'opacity-0']"
            :style="bottomFadeStyle"
            aria-hidden="true"
        />
        <ScrollAreaScrollbar orientation="vertical" :class="scrollbarClasses">
            <ScrollAreaThumb :class="thumbClasses" />
        </ScrollAreaScrollbar>
        <ScrollAreaScrollbar v-if="horizontal" orientation="horizontal" :class="scrollbarClasses">
            <ScrollAreaThumb :class="thumbClasses" />
        </ScrollAreaScrollbar>
    </ScrollAreaRoot>
</template>
