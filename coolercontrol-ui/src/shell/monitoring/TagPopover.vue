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
import {
    mdiCheck,
    mdiDragVertical,
    mdiPencilOutline,
    mdiPlus,
    mdiTagOutline,
    mdiTrashCanOutline,
} from '@mdi/js'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, nextTick, ref, type Ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueDraggable } from 'vue-draggable-plus'
import type { UID } from '@/models/Device.ts'
import type { TagSettings } from '@/models/UISettings.ts'
import CCColorPicker from '@/components/CCColorPicker.vue'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { useThemeColorsStore } from '@/stores/ThemeColorsStore.ts'

const props = defineProps<{
    deviceUID: UID
    channelName: string
}>()
const emit = defineEmits<{ (e: 'open', value: boolean): void }>()

const settingsStore = useSettingsStore()
const colorStore = useThemeColorsStore()
const { t } = useI18n()

const DEFAULT_TAG_COLOR = '#568af2'
const MAX_TAG_NAME_LENGTH = 15

const open = ref(false)
watch(open, (value) => emit('open', value))

const newTagName: Ref<string> = ref('')
const newTagColor: Ref<string> = ref(DEFAULT_TAG_COLOR)

interface TagEntry {
    name: string
    settings: TagSettings
}

const tagList: Ref<Array<TagEntry>> = ref([])
const syncTagList = (): void => {
    tagList.value = Array.from(settingsStore.tags.entries()).map(([name, settings]) => ({
        name,
        settings,
    }))
}
syncTagList()
watch(() => settingsStore.tags, syncTagList, { deep: true })

const onDragEnd = (): void => {
    settingsStore.reorderTags(tagList.value.map((entry) => entry.name))
}

const editingTagName: Ref<string | null> = ref(null)
const editName: Ref<string> = ref('')
const editColor: Ref<string> = ref('')
const editNameInput = ref()

const assignedTags = computed(() =>
    settingsStore.getChannelTags(props.deviceUID, props.channelName),
)
const isAssigned = (tagName: string): boolean => assignedTags.value.includes(tagName)
const toggleTag = (tagName: string): void => {
    if (isAssigned(tagName)) {
        settingsStore.removeTagFromChannel(props.deviceUID, props.channelName, tagName)
    } else {
        settingsStore.assignTagToChannel(props.deviceUID, props.channelName, tagName)
    }
}

const newTagValid = computed(
    () =>
        newTagName.value.trim().length > 0 && newTagName.value.trim().length < MAX_TAG_NAME_LENGTH,
)
const createAndAssign = (): void => {
    const name = newTagName.value.trim()
    if (name.length === 0) return
    if (!settingsStore.tags.has(name)) {
        settingsStore.createTag(name, newTagColor.value)
    }
    settingsStore.assignTagToChannel(props.deviceUID, props.channelName, name)
    newTagName.value = ''
    newTagColor.value = DEFAULT_TAG_COLOR
}

const startEdit = (tagName: string): void => {
    const tag = settingsStore.tags.get(tagName)
    if (tag == null) return
    editingTagName.value = tagName
    editName.value = tagName
    editColor.value = colorStore.rgbToHex(tag.color)
    nextTick(() => {
        const inputRef = Array.isArray(editNameInput.value)
            ? editNameInput.value[0]
            : editNameInput.value
        inputRef?.focus()
    })
}
const saveEdit = (): void => {
    if (editingTagName.value == null) return
    const oldName = editingTagName.value
    const newName = editName.value.trim()
    if (newName.length === 0) {
        cancelEdit()
        return
    }
    settingsStore.updateTagColor(oldName, editColor.value)
    if (newName !== oldName) {
        settingsStore.renameTag(oldName, newName)
    }
    editingTagName.value = null
}
const cancelEdit = (): void => {
    editingTagName.value = null
}
const deleteTag = (tagName: string): void => {
    settingsStore.deleteTag(tagName)
}

const inputClasses =
    'h-8 min-w-0 flex-1 rounded-lg border border-border-one bg-bg-one px-2 text-sm text-text-color outline-none focus:ring-2 focus:ring-accent'
</script>

<template>
    <PopoverRoot v-model:open="open">
        <!-- Custom trigger (e.g. the assigned-tag chips). Rendered as a span so
             it can nest inside a row's RouterLink; stop+prevent avoids navigating. -->
        <PopoverTrigger
            v-if="$slots.trigger"
            as="span"
            class="cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @click.stop.prevent
        >
            <slot name="trigger" />
        </PopoverTrigger>
        <PopoverTrigger
            v-else
            class="rounded p-1 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
            v-tooltip.top="t('components.menuTagAssign.title')"
            @click.prevent
        >
            <svg-icon type="mdi" :path="mdiTagOutline" :size="16" />
        </PopoverTrigger>
        <PopoverPortal>
            <PopoverContent
                side="bottom"
                align="start"
                :side-offset="2"
                class="z-50 w-72 rounded-lg border border-border-one bg-bg-two p-3 text-base text-text-color shadow-overlay outline-none"
            >
                <div class="pb-2 text-sm font-medium">
                    {{ t('components.menuTagAssign.title') }}
                </div>
                <VueDraggable
                    v-model="tagList"
                    :animation="200"
                    handle=".tag-drag-handle"
                    class="flex flex-col gap-y-0.5"
                    @end="onDragEnd"
                >
                    <div v-for="entry in tagList" :key="entry.name">
                        <div
                            v-if="editingTagName === entry.name"
                            class="flex items-center gap-2 rounded-lg bg-bg-one p-1.5"
                        >
                            <CCColorPicker
                                v-model="editColor"
                                color-format="hex"
                                :default-color="editColor"
                                :size="1.5"
                            />
                            <input
                                ref="editNameInput"
                                v-model="editName"
                                :maxlength="MAX_TAG_NAME_LENGTH"
                                :class="inputClasses"
                                @keydown.enter.prevent="saveEdit"
                                @keydown.escape.prevent="cancelEdit"
                                @blur="saveEdit"
                            />
                        </div>
                        <div
                            v-else
                            class="group/tag flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-surface-hover"
                        >
                            <svg-icon
                                type="mdi"
                                :path="mdiDragVertical"
                                :size="14"
                                class="tag-drag-handle shrink-0 cursor-grab text-text-color-secondary"
                            />
                            <button
                                type="button"
                                class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 outline-none"
                                @click="toggleTag(entry.name)"
                            >
                                <svg-icon
                                    type="mdi"
                                    :path="mdiCheck"
                                    :size="16"
                                    class="shrink-0"
                                    :class="isAssigned(entry.name) ? 'text-accent' : 'invisible'"
                                />
                                <span
                                    class="h-3 w-3 shrink-0 rounded-full"
                                    :style="{
                                        backgroundColor: colorStore.rgbToHex(entry.settings.color),
                                    }"
                                />
                                <span class="truncate text-sm">{{ entry.name }}</span>
                            </button>
                            <div class="hidden shrink-0 items-center gap-0.5 group-hover/tag:flex">
                                <button
                                    type="button"
                                    class="rounded p-0.5 text-text-color-secondary outline-none hover:text-text-color"
                                    v-tooltip.top="t('components.menuTagAssign.editTag')"
                                    @click="startEdit(entry.name)"
                                >
                                    <svg-icon type="mdi" :path="mdiPencilOutline" :size="14" />
                                </button>
                                <button
                                    type="button"
                                    class="rounded p-0.5 text-text-color-secondary outline-none hover:text-error"
                                    v-tooltip.top="t('components.menuTagAssign.deleteTag')"
                                    @click="deleteTag(entry.name)"
                                >
                                    <svg-icon type="mdi" :path="mdiTrashCanOutline" :size="14" />
                                </button>
                            </div>
                        </div>
                    </div>
                </VueDraggable>
                <div
                    v-if="settingsStore.tags.size === 0"
                    class="pb-1 text-sm text-text-color-secondary"
                >
                    {{ t('components.menuTagAssign.noTags') }}
                </div>
                <div class="mt-2 flex items-center gap-2 border-t border-border-one pt-3">
                    <CCColorPicker
                        v-model="newTagColor"
                        color-format="hex"
                        :default-color="DEFAULT_TAG_COLOR"
                        :size="1.5"
                    />
                    <input
                        v-model="newTagName"
                        :placeholder="t('components.menuTagAssign.tagName')"
                        :maxlength="MAX_TAG_NAME_LENGTH"
                        :class="inputClasses"
                        @keydown.enter.prevent="createAndAssign"
                    />
                    <button
                        type="button"
                        class="rounded-lg border border-border-one p-1.5 text-text-color outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50"
                        :disabled="!newTagValid"
                        v-tooltip.top="t('common.add')"
                        @click="createAndAssign"
                    >
                        <svg-icon type="mdi" :path="mdiPlus" :size="16" />
                    </button>
                </div>
            </PopoverContent>
        </PopoverPortal>
    </PopoverRoot>
</template>
