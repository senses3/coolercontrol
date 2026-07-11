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
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiTag } from '@mdi/js'
import { computed } from 'vue'
import type { UID } from '@/models/Device.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { useThemeColorsStore } from '@/stores/ThemeColorsStore.ts'

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
    <div v-if="tags.length > 0" class="flex shrink-0 items-center gap-0.5">
        <svg-icon
            v-for="name in tags"
            :key="name"
            v-tooltip.top="name"
            type="mdi"
            :path="mdiTag"
            :size="14"
            class="shrink-0"
            :style="{ color: tagColor(name) }"
        />
    </div>
</template>
