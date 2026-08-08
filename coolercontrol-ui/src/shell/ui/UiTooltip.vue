<!--
  SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import {
    TooltipContent,
    TooltipPortal,
    TooltipProvider,
    TooltipRoot,
    TooltipTrigger,
} from 'reka-ui'

withDefaults(
    defineProps<{
        text: string
        side?: 'top' | 'right' | 'bottom' | 'left'
    }>(),
    { side: 'top' },
)
</script>

<template>
    <TooltipProvider :delay-duration="300">
        <TooltipRoot>
            <TooltipTrigger as-child>
                <slot />
            </TooltipTrigger>
            <TooltipPortal>
                <TooltipContent
                    :side="side"
                    :side-offset="6"
                    class="z-50 max-w-80 whitespace-pre-line rounded-lg border border-border-one bg-bg-two px-2.5 py-1.5 text-sm text-text-color shadow-overlay"
                >
                    {{ text }}
                </TooltipContent>
            </TooltipPortal>
        </TooltipRoot>
    </TooltipProvider>
</template>
