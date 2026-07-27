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
// Guard next to a bounded control: unlocked lets the control reach values
// outside its recommended band, and colors itself to say so.
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiLockOpenVariantOutline, mdiLockOutline } from '@mdi/js'
import { computed } from 'vue'

const unlocked = defineModel<boolean>({ required: true })
const icon = computed(() => (unlocked.value ? mdiLockOpenVariantOutline : mdiLockOutline))
</script>

<template>
    <button
        type="button"
        class="inline-flex h-10 w-8 items-center justify-center rounded-lg outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
        :class="unlocked ? 'text-warning' : 'text-text-color-secondary hover:text-text-color'"
        :aria-pressed="unlocked"
        @click="unlocked = !unlocked"
    >
        <svg-icon type="mdi" :path="icon" :size="16" />
    </button>
</template>
