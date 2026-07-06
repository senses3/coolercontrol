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

withDefaults(defineProps<{ horizontal?: boolean }>(), { horizontal: false })

const scrollbarClasses =
    'flex select-none touch-none py-2 bg-transparent transition-colors duration-[120ms] ' +
    'ease-out data-[orientation=vertical]:w-1.5 data-[orientation=horizontal]:h-1.5 ' +
    'data-[orientation=horizontal]:flex-col'

const thumbClasses =
    "flex-1 bg-text-color-secondary opacity-40 rounded-lg relative before:content-[''] " +
    'before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 ' +
    'before:-translate-y-1/2 before:w-full before:h-full before:min-w-2 before:min-h-[44px]'
</script>

<template>
    <ScrollAreaRoot class="h-full w-full" type="hover" :scroll-hide-delay="100">
        <ScrollAreaViewport class="h-full w-full">
            <slot />
        </ScrollAreaViewport>
        <ScrollAreaScrollbar orientation="vertical" :class="scrollbarClasses">
            <ScrollAreaThumb :class="thumbClasses" />
        </ScrollAreaScrollbar>
        <ScrollAreaScrollbar v-if="horizontal" orientation="horizontal" :class="scrollbarClasses">
            <ScrollAreaThumb :class="thumbClasses" />
        </ScrollAreaScrollbar>
    </ScrollAreaRoot>
</template>
