<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'
import { computed, onMounted, provide, ref, onUnmounted } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import ShellRail from '@/shell/ShellRail.vue'
import ShellHeader from '@/shell/ShellHeader.vue'
import ShellPanel from '@/shell/ShellPanel.vue'
import ShellBottomNav from '@/shell/ShellBottomNav.vue'
import { hotkeySections } from '@/shell/sections.ts'
import hotkeys from 'hotkeys-js'
import { useRouter } from 'vue-router'
import { useShortcutsDialog } from '@/composables/useShortcutsDialog.ts'
import ShellSearchPalette from '@/shell/search/ShellSearchPalette.vue'
import { openPalette } from '@/shell/search/palette.ts'
import DetectionModal from '@/shell/hardware/DetectionModal.vue'
import HardwareReportModal from '@/shell/hardware/HardwareReportModal.vue'
import { detectionOpen, hardwareReportOpen } from '@/shell/hardware/hardwareModals.ts'

const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const { width } = useWindowSize()
const isMobile = computed(() => width.value < 768)

const minPanelWidthRem = 14
const panelRef = ref<InstanceType<typeof SplitterPanel>>()
const remPx = deviceStore.getREMSize(1)

// Sized in px (size-unit) so the saved rem width applies as-is. Percent sizing
// needed the group's measured width, which is only known after the panel has
// already registered its default-size, so the saved width was both ignored and
// then overwritten by the initial resize event. default-size is read once at
// registration; the store stays the source of truth.
const minPanelWidthPx = minPanelWidthRem * remPx
const panelWidthPx = computed(() => settingsStore.mainMenuWidthRem * remPx)

const onPanelResize = (sizePx: number): void => {
    if (panelRef.value?.isCollapsed || sizePx < minPanelWidthPx) return
    settingsStore.mainMenuWidthRem = Math.round((sizePx * 10) / remPx) / 10
}

onMounted(() => {
    if (isMobile.value) return
    if (settingsStore.collapsedMainMenu) {
        // timeout needed as the auto-expand happens after onMounted code.
        setTimeout(() => panelRef.value?.collapse())
    }
})

// The header collapse button toggles the splitter directly (provide/inject);
// that fires the panel's @collapse/@expand, which persists collapsedMainMenu.
const toggleMainMenu = (): void => {
    if (panelRef.value == null) return
    if (panelRef.value.isCollapsed) panelRef.value.expand()
    else panelRef.value.collapse()
}
provide('toggleMainMenu', toggleMainMenu)

// Section hotkeys: ctrl+N opens the Nth section of the current mode, so simple
// mode renumbers along with its shorter rail. Browsers reserve Ctrl+number for
// tab switching, so the Ctrl+Alt variants exist for web use; plain Ctrl+number
// works in the Qt app. The mode is read inside the handler because the bindings
// are registered once, at setup.
const router = useRouter()
const { openShortcutsDialog } = useShortcutsDialog()
const SECTION_DIGITS = ['1', '2', '3', '4', '5', '6']
const HOTKEY_SCOPES: string[] = []
for (const [index, digit] of SECTION_DIGITS.entries()) {
    const combo = `ctrl+${digit},ctrl+alt+${digit}`
    HOTKEY_SCOPES.push(combo)
    hotkeys(combo, (event) => {
        const section = hotkeySections(settingsStore.uiMode)[index]
        if (section == null) return
        if (section.id === 'plugins' && deviceStore.plugins.length === 0) return
        event.preventDefault()
        router.push({ name: section.routeName })
    })
}
hotkeys('ctrl+,', (event) => {
    event.preventDefault()
    router.push({ name: 'settings' })
})
hotkeys('ctrl+/,ctrl+shift+/', (event) => {
    event.preventDefault()
    openShortcutsDialog()
})
// Firefox and Chrome bind ctrl+k to the address bar, so preventDefault has to
// win here; the header field is the mouse path when the page is not focused.
// Simple mode has no palette, checked in the handler because the binding is
// registered once, at setup.
hotkeys('ctrl+k', (event) => {
    if (settingsStore.isSimpleMode) return
    event.preventDefault()
    openPalette(true)
})
onUnmounted(() => {
    for (const combo of HOTKEY_SCOPES) hotkeys.unbind(combo)
    hotkeys.unbind('ctrl+,')
    hotkeys.unbind('ctrl+/,ctrl+shift+/')
    hotkeys.unbind('ctrl+k')
})
</script>

<template>
    <!--Mobile View-->
    <div v-if="isMobile" class="flex h-screen w-full flex-col bg-bg-two text-text-color">
        <ShellSearchPalette />
        <DetectionModal v-model:open="detectionOpen" />
        <HardwareReportModal v-model:open="hardwareReportOpen" />
        <ShellHeader />
        <div class="min-h-0 flex-1 px-2 pb-2">
            <div class="h-full overflow-hidden rounded-lg border border-border-one bg-bg-one">
                <router-view v-slot="{ Component, route }">
                    <Suspense>
                        <component :is="Component" :key="route.path + (route.query?.key ?? '')" />
                    </Suspense>
                </router-view>
            </div>
        </div>
        <ShellBottomNav />
    </div>
    <!--Desktop View-->
    <div v-else class="flex h-screen w-full flex-row bg-bg-two text-text-color">
        <ShellSearchPalette />
        <DetectionModal v-model:open="detectionOpen" />
        <HardwareReportModal v-model:open="hardwareReportOpen" />
        <ShellRail />
        <div class="flex min-w-0 flex-1 flex-col pb-2 pr-2">
            <ShellHeader />
            <!-- Simple mode has no contextual panel: the page owns the width. -->
            <div
                v-if="settingsStore.isSimpleMode"
                class="min-h-0 flex-1 truncate rounded-lg border border-border-one bg-bg-one"
            >
                <router-view v-slot="{ Component, route }">
                    <Suspense>
                        <component :is="Component" :key="route.path + (route.query?.key ?? '')" />
                    </Suspense>
                </router-view>
            </div>
            <SplitterGroup
                v-else
                direction="horizontal"
                :keyboard-resize-by="10"
                class="min-h-0 flex-1"
            >
                <SplitterPanel
                    ref="panelRef"
                    collapsible
                    size-unit="px"
                    :default-size="panelWidthPx"
                    :min-size="minPanelWidthPx"
                    class="rounded-lg border-border-one bg-bg-one"
                    :class="{ border: !settingsStore.collapsedMainMenu }"
                    @resize="onPanelResize"
                    @collapse="settingsStore.collapsedMainMenu = true"
                    @expand="settingsStore.collapsedMainMenu = false"
                >
                    <ShellPanel />
                </SplitterPanel>
                <SplitterResizeHandle
                    class="bg-bg-two"
                    :class="settingsStore.collapsedMainMenu ? 'w-1' : 'w-3'"
                />
                <SplitterPanel
                    :min-size="30"
                    class="truncate rounded-lg border border-border-one bg-bg-one"
                >
                    <router-view v-slot="{ Component, route }">
                        <Suspense>
                            <component
                                :is="Component"
                                :key="route.path + (route.query?.key ?? '')"
                            />
                        </Suspense>
                    </router-view>
                </SplitterPanel>
            </SplitterGroup>
        </div>
    </div>
</template>
