<!--
  SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import { Separator } from 'reka-ui'

withDefaults(defineProps<{ orientation?: 'horizontal' | 'vertical' }>(), {
    orientation: 'horizontal',
})
</script>

<template>
    <!-- shrink-0: a separator is one pixel, so a flex parent whose content
         overflows would otherwise shrink it away entirely (the panel title
         rules vanished on the taller sections). -->
    <Separator
        :orientation="orientation"
        class="shrink-0 bg-border-one data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px"
    />
</template>
