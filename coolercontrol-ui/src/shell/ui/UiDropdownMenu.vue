<!--
  SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import {
    DropdownMenuContent,
    DropdownMenuPortal,
    DropdownMenuRoot,
    DropdownMenuTrigger,
} from 'reka-ui'

withDefaults(
    defineProps<{
        side?: 'top' | 'right' | 'bottom' | 'left'
        align?: 'start' | 'center' | 'end'
        sideOffset?: number
    }>(),
    { side: 'bottom', align: 'end', sideOffset: 2 },
)
</script>

<template>
    <DropdownMenuRoot>
        <DropdownMenuTrigger as-child>
            <slot name="trigger" />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
            <DropdownMenuContent
                :side="side"
                :align="align"
                :side-offset="sideOffset"
                class="z-[1300] min-w-44 rounded-lg border border-border-one bg-bg-two p-1 shadow-overlay-lg"
            >
                <slot />
            </DropdownMenuContent>
        </DropdownMenuPortal>
    </DropdownMenuRoot>
</template>
