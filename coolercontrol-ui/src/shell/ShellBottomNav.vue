<!--
  SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { type SectionId, SHELL_SECTIONS } from '@/shell/sections.ts'

const route = useRoute()
const { t } = useI18n()
const deviceStore = useDeviceStore()
const activeSection = computed(() => route.meta.section as SectionId | undefined)
</script>

<template>
    <nav
        id="shell-bottom-nav"
        class="flex h-14 shrink-0 items-stretch justify-around border-t border-border-one"
    >
        <RouterLink
            v-for="section in SHELL_SECTIONS"
            :key="section.id"
            :to="{ name: section.routeName }"
            class="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 outline-none"
            :class="activeSection === section.id ? 'text-accent' : 'text-text-color-secondary'"
        >
            <!-- The rail's current-section mark, turned on its side. -->
            <span
                v-if="activeSection === section.id"
                class="absolute inset-x-2 top-0 h-[2px] rounded-full bg-gradient-to-r from-accent to-accent-gradient-to"
            />
            <svg-icon type="mdi" :path="section.icon" :size="deviceStore.getREMSize(1.4)" />
            <span class="block w-full truncate text-center text-[0.8125rem] leading-tight">{{
                t(section.labelKey)
            }}</span>
        </RouterLink>
    </nav>
</template>
