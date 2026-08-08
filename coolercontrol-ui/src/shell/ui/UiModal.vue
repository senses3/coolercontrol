<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiClose } from '@mdi/js'
import {
    DialogContent,
    DialogDescription,
    DialogOverlay,
    DialogPortal,
    DialogRoot,
    DialogTitle,
} from 'reka-ui'

const open = defineModel<boolean>('open', { required: true })
const props = withDefaults(
    defineProps<{
        title?: string
        description?: string
        contentClass?: string
        contentStyle?: Record<string, string>
        closable?: boolean
        // dismissable: allow an outside/overlay click to close (PrimeVue dismissableMask).
        dismissable?: boolean
        // closeOnEscape: allow the Escape key to close. Kept separate from
        // dismissable so a dialog can protect against stray outside-clicks while
        // still honoring an intentional Escape (access tokens / password prompt).
        closeOnEscape?: boolean
        // modal: render the dimming/blocking overlay and trap focus.
        modal?: boolean
    }>(),
    {
        title: '',
        description: '',
        contentClass: '',
        closable: true,
        dismissable: true,
        closeOnEscape: true,
        modal: true,
    },
)

// Block reka's auto-close on outside-click / escape independently.
const guardOutside = (event: Event): void => {
    if (!props.dismissable) event.preventDefault()
}
const guardEscape = (event: Event): void => {
    if (!props.closeOnEscape) event.preventDefault()
}
</script>

<template>
    <DialogRoot v-model:open="open" :modal="modal">
        <DialogPortal>
            <DialogOverlay
                v-if="modal"
                class="fixed inset-0 z-[1200] bg-black/50 backdrop-blur-[2px]"
            />
            <DialogContent
                class="fixed left-1/2 top-1/2 z-[1210] max-h-[92vh] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border-one bg-bg-two p-6 text-text-color shadow-xl outline-none"
                :class="contentClass"
                :style="contentStyle"
                @escape-key-down="guardEscape"
                @pointer-down-outside="guardOutside"
                @interact-outside="guardOutside"
            >
                <div class="mb-4 flex items-start justify-between gap-4">
                    <DialogTitle
                        :class="title ? 'text-xl font-semibold text-text-color' : 'sr-only'"
                    >
                        {{ title || 'Dialog' }}
                    </DialogTitle>
                    <DialogDescription class="sr-only">
                        {{ description || title || 'Dialog content' }}
                    </DialogDescription>
                    <button
                        v-if="closable"
                        type="button"
                        aria-label="close"
                        class="-mr-1 -mt-1 shrink-0 rounded text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                        @click="open = false"
                    >
                        <svg-icon type="mdi" :path="mdiClose" :size="20" />
                    </button>
                </div>
                <slot />
            </DialogContent>
        </DialogPortal>
    </DialogRoot>
</template>
