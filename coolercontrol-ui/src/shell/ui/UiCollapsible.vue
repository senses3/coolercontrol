<!--
  SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiChevronRight } from '@mdi/js'
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui'

withDefaults(
    defineProps<{
        title: string
        defaultOpen?: boolean
    }>(),
    { defaultOpen: false },
)
</script>

<template>
    <CollapsibleRoot :default-open="defaultOpen" class="w-full">
        <CollapsibleTrigger
            class="group flex w-full cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-text-color outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
        >
            <svg-icon
                type="mdi"
                :path="mdiChevronRight"
                :size="16"
                class="transition-transform group-data-[state=open]:rotate-90"
            />
            <span class="truncate">{{ title }}</span>
        </CollapsibleTrigger>
        <CollapsibleContent class="overflow-hidden">
            <slot />
        </CollapsibleContent>
    </CollapsibleRoot>
</template>
