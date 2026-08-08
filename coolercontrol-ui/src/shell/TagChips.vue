<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiTag } from '@mdi/js'
import { computed } from 'vue'
import type { UID } from '@/models/Device.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { useThemeColorsStore } from '@/stores/ThemeColorsStore.ts'
import TagPopover from '@/shell/monitoring/TagPopover.vue'

const props = defineProps<{ deviceUID: UID; channelName: string }>()
const settingsStore = useSettingsStore()
const colorStore = useThemeColorsStore()

const tags = computed(() => settingsStore.getChannelTags(props.deviceUID, props.channelName))
const tagColor = (name: string): string => {
    const color = settingsStore.tags.get(name)?.color
    return color ? colorStore.rgbToHex(color) : 'rgb(var(--colors-text-color-secondary))'
}
</script>

<template>
    <TagPopover v-if="tags.length > 0" :device-u-i-d="deviceUID" :channel-name="channelName">
        <template #trigger>
            <span class="flex shrink-0 items-center gap-0.5">
                <svg-icon
                    v-for="name in tags"
                    :key="name"
                    v-tooltip.top="name"
                    type="mdi"
                    :path="mdiTag"
                    :size="14"
                    class="shrink-0 outline-none"
                    focusable="false"
                    :style="{ color: tagColor(name) }"
                />
            </span>
        </template>
    </TagPopover>
</template>
