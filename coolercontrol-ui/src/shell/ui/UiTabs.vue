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
import { TabsList, TabsRoot, TabsTrigger } from 'reka-ui'

export interface UiTab {
    value: string
    label: string
    icon?: string
}

const model = defineModel<string>({ required: true })
defineProps<{ tabs: UiTab[] }>()
</script>

<template>
    <TabsRoot v-model="model">
        <TabsList class="flex border-b border-border-one">
            <TabsTrigger
                v-for="tab in tabs"
                :key="tab.value"
                :value="tab.value"
                class="flex flex-1 items-center justify-center gap-2 border-b-2 border-transparent px-4 py-3 text-base text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent data-[state=active]:border-accent data-[state=active]:text-text-color"
            >
                <svg-icon v-if="tab.icon" type="mdi" :path="tab.icon" :size="20" />
                {{ tab.label }}
            </TabsTrigger>
        </TabsList>
        <slot />
    </TabsRoot>
</template>
