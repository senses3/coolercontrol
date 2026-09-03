<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// One Library section: a header with its two add buttons, then the entities and
// their folders in one interleaved, drag-sortable list. Used twice, for
// Profiles and for Functions, which differ only in icon, route and badge.
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import {
    mdiChevronDown,
    mdiChevronRight,
    mdiDragVertical,
    mdiFolderOpenOutline,
    mdiFolderOutline,
    mdiFolderPlusOutline,
    mdiPencilOutline,
    mdiPlus,
    mdiTrashCanOutline,
} from '@mdi/js'
import { VueDraggable } from 'vue-draggable-plus'
import { computed, nextTick, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { DEFAULT_NAME_STRING_LENGTH, useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import {
    addFolder,
    buildLibraryLists,
    isFolderId,
    newFolderId,
    persistLibraryLists,
    removeFolder,
    setFolderName,
    type LibraryKind,
    type LibraryLists,
} from '@/shell/libraryFolders.ts'

const props = defineProps<{
    kind: LibraryKind
    label: string
    addTooltip: string
    icon: string
    routeName: string
    paramName: string
    entities: Array<{ uid: string; name: string }>
}>()
const emit = defineEmits<{ add: []; reorder: [] }>()

const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()

const lists = ref<LibraryLists>({ rootIds: [], folderChildren: {} })
watchEffect(() => {
    lists.value = buildLibraryLists(
        settingsStore.menuOrder,
        props.kind,
        props.entities.map((entity) => entity.uid),
    )
})

const persist = (): void => {
    settingsStore.menuOrder = persistLibraryLists(settingsStore.menuOrder, props.kind, lists.value)
    emit('reorder')
}

const entityName = computed(
    () => new Map(props.entities.map((entity) => [entity.uid, entity.name])),
)
const entityTarget = (uid: string) => ({
    name: props.routeName,
    params: { [props.paramName]: uid },
})

const folderNames = computed(() => new Map(settingsStore.libraryFolderNames))
// A folder whose name was never set, or was cleared, reads as a new one rather
// than as a blank row.
const folderLabel = (id: string): string =>
    folderNames.value.get(id) || t('layout.shell.coolingPanel.newFolder')

// Listed means expanded. A folder is put on the list the moment it is created,
// so only one a user has actually closed is missing from it.
const isExpanded = (id: string): boolean => settingsStore.expandedMenuIds?.includes(id) ?? false
const setExpanded = (id: string, expanded: boolean): void => {
    const current = settingsStore.expandedMenuIds ?? []
    if (expanded === current.includes(id)) return
    settingsStore.expandedMenuIds = expanded
        ? [...current, id]
        : current.filter((entry) => entry !== id)
}

const editingId = ref<string | null>(null)
// The folder the add button just made, which an abandoned edit takes back out
// again: a stray click should not leave a row to clean up.
const createdId = ref<string | null>(null)
const editingName = ref('')
const nameInput = ref()

const startRename = (id: string): void => {
    editingId.value = id
    editingName.value = folderNames.value.get(id) ?? ''
    nextTick(() => {
        const input = Array.isArray(nameInput.value) ? nameInput.value[0] : nameInput.value
        input?.focus()
        input?.select()
    })
}

const createFolder = (): void => {
    const id = newFolderId(props.kind)
    lists.value = addFolder(lists.value, id)
    setExpanded(id, true)
    persist()
    createdId.value = id
    startRename(id)
}

const discardFolder = (id: string): void => {
    lists.value = removeFolder(lists.value, id)
    settingsStore.libraryFolderNames = setFolderName(settingsStore.libraryFolderNames, id, '')
    setExpanded(id, false)
    persist()
}

const saveName = (): void => {
    const id = editingId.value
    if (id == null) return
    const name = deviceStore.sanitizeString(editingName.value)
    editingId.value = null
    const wasNew = id === createdId.value
    createdId.value = null
    if (wasNew && name.length === 0) {
        discardFolder(id)
        return
    }
    settingsStore.libraryFolderNames = setFolderName(settingsStore.libraryFolderNames, id, name)
}

const cancelRename = (): void => {
    const id = editingId.value
    editingId.value = null
    if (id != null && id === createdId.value) discardFolder(id)
    createdId.value = null
}
</script>

<template>
    <div class="flex items-center justify-between px-3 pb-1 pt-1">
        <span class="text-xs uppercase text-text-color-secondary opacity-70">{{ label }}</span>
        <div class="flex items-center gap-0.5">
            <button
                type="button"
                class="rounded p-0.5 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                v-tooltip.top="t('layout.shell.coolingPanel.addFolder')"
                @click="createFolder"
            >
                <svg-icon type="mdi" :path="mdiFolderPlusOutline" :size="16" />
            </button>
            <button
                type="button"
                class="rounded p-0.5 text-text-color-secondary outline-none hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                v-tooltip.top="addTooltip"
                @click="emit('add')"
            >
                <svg-icon type="mdi" :path="mdiPlus" :size="16" />
            </button>
        </div>
    </div>
    <VueDraggable
        v-model="lists.rootIds"
        handle=".root-drag-handle"
        :animation="150"
        class="flex flex-col gap-0.5"
        @end="persist"
    >
        <template v-for="id in lists.rootIds" :key="id">
            <div v-if="isFolderId(id)" :data-folder="id">
                <div
                    class="group/folder flex items-center gap-2 rounded-lg px-3 py-1 text-text-color hover:bg-surface-hover"
                >
                    <input
                        v-if="editingId === id"
                        ref="nameInput"
                        v-model="editingName"
                        type="text"
                        :maxlength="DEFAULT_NAME_STRING_LENGTH"
                        :placeholder="t('layout.shell.coolingPanel.newFolder')"
                        class="min-w-0 flex-1 rounded border border-border-one bg-control px-1 text-text-color outline-none focus:ring-2 focus:ring-accent"
                        @keydown.enter.prevent="saveName"
                        @keydown.esc.prevent="cancelRename"
                        @blur="saveName"
                    />
                    <template v-else>
                        <button
                            type="button"
                            class="flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            :aria-expanded="isExpanded(id)"
                            @click="setExpanded(id, !isExpanded(id))"
                        >
                            <svg-icon
                                type="mdi"
                                :path="isExpanded(id) ? mdiChevronDown : mdiChevronRight"
                                :size="16"
                                class="shrink-0 text-text-color-secondary"
                            />
                            <svg-icon
                                type="mdi"
                                :path="isExpanded(id) ? mdiFolderOpenOutline : mdiFolderOutline"
                                :size="18"
                                class="shrink-0 text-text-color-secondary"
                            />
                            <span class="truncate">{{ folderLabel(id) }}</span>
                        </button>
                        <div class="hidden shrink-0 items-center gap-0.5 group-hover/folder:flex">
                            <button
                                type="button"
                                class="rounded p-0.5 text-text-color-secondary outline-none hover:text-text-color"
                                v-tooltip.top="t('layout.menu.tooltips.rename')"
                                @click="startRename(id)"
                            >
                                <svg-icon type="mdi" :path="mdiPencilOutline" :size="14" />
                            </button>
                            <button
                                type="button"
                                class="rounded p-0.5 text-text-color-secondary outline-none hover:text-error"
                                v-tooltip.top="t('layout.shell.coolingPanel.deleteFolder')"
                                @click="discardFolder(id)"
                            >
                                <svg-icon type="mdi" :path="mdiTrashCanOutline" :size="14" />
                            </button>
                            <span
                                class="root-drag-handle cursor-grab p-0.5 text-text-color-secondary"
                            >
                                <svg-icon type="mdi" :path="mdiDragVertical" :size="16" />
                            </span>
                        </div>
                    </template>
                </div>
                <!-- v-show, not v-if: the drag layer keeps its instance, so a
                     collapsed folder is still a place a drop can land. -->
                <VueDraggable
                    v-show="isExpanded(id)"
                    :data-folder-items="id"
                    v-model="lists.folderChildren[id]"
                    handle=".child-drag-handle"
                    :animation="150"
                    class="ml-5 flex min-h-6 flex-col gap-0.5 border-l border-border-one pl-1"
                    @end="persist"
                >
                    <RouterLink
                        v-for="uid in lists.folderChildren[id]"
                        :key="uid"
                        :to="entityTarget(uid)"
                        class="group flex items-center gap-2 rounded-lg px-3 py-1 text-text-color outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
                        exact-active-class="bg-surface-hover !text-accent"
                    >
                        <svg-icon
                            type="mdi"
                            :path="icon"
                            :size="18"
                            class="shrink-0 text-text-color-secondary"
                        />
                        <span class="truncate">{{ entityName.get(uid) }}</span>
                        <slot name="badge" :uid="uid" />
                        <span
                            class="child-drag-handle ml-auto hidden cursor-grab p-0.5 text-text-color-secondary group-hover:inline-flex"
                        >
                            <svg-icon type="mdi" :path="mdiDragVertical" :size="16" />
                        </span>
                    </RouterLink>
                </VueDraggable>
            </div>
            <RouterLink
                v-else
                :to="entityTarget(id)"
                class="group flex items-center gap-2 rounded-lg px-3 py-1 text-text-color outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
                exact-active-class="bg-surface-hover !text-accent"
            >
                <svg-icon
                    type="mdi"
                    :path="icon"
                    :size="18"
                    class="shrink-0 text-text-color-secondary"
                />
                <span class="truncate">{{ entityName.get(id) }}</span>
                <slot name="badge" :uid="id" />
                <span
                    class="root-drag-handle ml-auto hidden cursor-grab p-0.5 text-text-color-secondary group-hover:inline-flex"
                >
                    <svg-icon type="mdi" :path="mdiDragVertical" :size="16" />
                </span>
            </RouterLink>
        </template>
    </VueDraggable>
</template>
