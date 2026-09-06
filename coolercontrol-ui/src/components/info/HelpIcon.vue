<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// The single help affordance for the app. Hovering previews the text, clicking
// pins it open so a multi-line list can actually be read. Every site routes
// through here so the colour and behaviour have one home.
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiHelpCircleOutline, mdiInformationSlabCircleOutline } from '@mdi/js'
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui'
import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'

// PopoverRoot renders a fragment, so a class from the call site has no single
// root to land on and Vue drops it. Forward it to the trigger by hand.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
    defineProps<{
        text: string
        /** Text shown next to the icon. Also becomes the accessible name. */
        label?: string
        side?: 'top' | 'right' | 'bottom' | 'left'
        variant?: 'info' | 'help'
        /** Icon size in rem, scaled by the user's UI scale. */
        size?: number
    }>(),
    { side: 'top', variant: 'info', size: 1.25 },
)

const deviceStore = useDeviceStore()
const { t } = useI18n()

// Opening on focus would fire whenever a container autofocuses its first
// focusable element, which this button often is. Keyboard users get the same
// reach through Enter and Space, which the click handler already pins.
const HOVER_OPEN_MS = 300
const HOVER_CLOSE_MS = 150

const open = ref(false)
const pinned = ref(false)
const triggerRef = ref<HTMLElement>()
let openTimer: ReturnType<typeof setTimeout> | undefined
let closeTimer: ReturnType<typeof setTimeout> | undefined

const iconPath = computed(() =>
    props.variant === 'help' ? mdiHelpCircleOutline : mdiInformationSlabCircleOutline,
)
const accessibleName = computed(() => props.label ?? t('common.moreInfo'))

const clearTimers = (): void => {
    clearTimeout(openTimer)
    clearTimeout(closeTimer)
}
const hoverOpen = (): void => {
    clearTimers()
    openTimer = setTimeout(() => (open.value = true), HOVER_OPEN_MS)
}
const hoverClose = (): void => {
    clearTimers()
    if (pinned.value) return
    closeTimer = setTimeout(() => (open.value = false), HOVER_CLOSE_MS)
}
const togglePinned = (): void => {
    clearTimers()
    pinned.value = !pinned.value
    open.value = pinned.value
}
// Esc and outside clicks come back through the root, so unpin with them.
const onOpenChange = (value: boolean): void => {
    open.value = value
    if (!value) pinned.value = false
}
// The trigger sits outside the content, so reka reads a click on it as a
// dismiss and closes before the click handler pins it. That read as a flash.
const onInteractOutside = (event: {
    detail: { originalEvent: Event }
    preventDefault: () => void
}): void => {
    const target = event.detail.originalEvent.target
    if (target instanceof Node && triggerRef.value?.contains(target) === true) {
        event.preventDefault()
    }
}
// A hover-opened popover must not steal focus from whatever the user is doing.
const onOpenAutoFocus = (event: Event): void => {
    if (!pinned.value) event.preventDefault()
}

onUnmounted(clearTimers)
</script>

<template>
    <PopoverRoot :open="open" @update:open="onOpenChange">
        <PopoverAnchor as-child>
            <button
                ref="triggerRef"
                v-bind="$attrs"
                type="button"
                class="flex cursor-help items-center gap-1.5 rounded text-info outline-none focus-visible:ring-2 focus-visible:ring-accent"
                :aria-label="accessibleName"
                aria-haspopup="dialog"
                :aria-expanded="open"
                @click="togglePinned"
                @mouseenter="hoverOpen"
                @mouseleave="hoverClose"
            >
                <svg-icon
                    type="mdi"
                    class="shrink-0"
                    :path="iconPath"
                    :size="deviceStore.getREMSize(props.size)"
                />
                <span v-if="props.label" class="text-sm leading-none">{{ props.label }}</span>
            </button>
        </PopoverAnchor>
        <PopoverPortal>
            <PopoverContent
                :side="props.side"
                :side-offset="6"
                class="z-[1500] max-w-80 whitespace-pre-line rounded-lg border border-border-one bg-bg-two px-2.5 py-1.5 text-sm text-text-color shadow-overlay"
                @open-auto-focus="onOpenAutoFocus"
                @interact-outside="onInteractOutside"
                @mouseenter="clearTimers"
                @mouseleave="hoverClose"
            >
                {{ props.text }}
            </PopoverContent>
        </PopoverPortal>
    </PopoverRoot>
</template>
