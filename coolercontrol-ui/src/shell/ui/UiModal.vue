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
import { mdiClose } from '@mdi/js'
import {
    DialogContent,
    DialogDescription,
    DialogOverlay,
    DialogPortal,
    DialogRoot,
    DialogTitle,
} from 'reka-ui'

const open = defineModel<boolean>('open', { required: true })
withDefaults(
    defineProps<{
        title?: string
        description?: string
        contentClass?: string
        closable?: boolean
    }>(),
    { title: '', description: '', contentClass: '', closable: true },
)
</script>

<template>
    <DialogRoot v-model:open="open">
        <DialogPortal>
            <DialogOverlay class="fixed inset-0 z-[1340] bg-black/50 backdrop-blur-[2px]" />
            <DialogContent
                class="fixed left-1/2 top-1/2 z-[1350] max-h-[92vh] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border-one bg-bg-two p-6 shadow-xl outline-none"
                :class="contentClass"
            >
                <div class="mb-4 flex items-start justify-between gap-4">
                    <DialogTitle
                        :class="title ? 'text-xl font-semibold text-text-color' : 'sr-only'"
                    >
                        {{ title || 'Dialog' }}
                    </DialogTitle>
                    <DialogDescription class="sr-only">
                        {{ description || title || 'Dialog content' }}
                    </DialogDescription>
                    <button
                        v-if="closable"
                        type="button"
                        aria-label="close"
                        class="-mr-1 -mt-1 shrink-0 rounded text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                        @click="open = false"
                    >
                        <svg-icon type="mdi" :path="mdiClose" :size="20" />
                    </button>
                </div>
                <slot />
            </DialogContent>
        </DialogPortal>
    </DialogRoot>
</template>
