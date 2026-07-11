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
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'
import { computed, onMounted, provide, ref, onUnmounted } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import ShellRail from '@/shell/ShellRail.vue'
import ShellHeader from '@/shell/ShellHeader.vue'
import ShellPanel from '@/shell/ShellPanel.vue'
import ShellBottomNav from '@/shell/ShellBottomNav.vue'
import hotkeys from 'hotkeys-js'
import { useRouter } from 'vue-router'
import { useShortcutsDialog } from '@/composables/useShortcutsDialog.ts'

const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const { width } = useWindowSize()
const isMobile = computed(() => width.value < 768)

const minPanelWidthRem = 14
const panelRef = ref<InstanceType<typeof SplitterPanel>>()
const groupRef = ref<InstanceType<typeof SplitterGroup>>()
const groupWidthPx = ref(1600)
const remPx = deviceStore.getREMSize(1)

const panelWidthPercent = ref(20)
const calcPercent = (rem: number): number => Math.min((rem * remPx * 100) / groupWidthPx.value, 50)
const panelMinPercent = computed(() => calcPercent(minPanelWidthRem))

const onPanelResize = (sizePercent: number): void => {
    if (panelRef.value?.isCollapsed || sizePercent < panelMinPercent.value) return
    panelWidthPercent.value = sizePercent
    settingsStore.mainMenuWidthRem =
        Math.round(((sizePercent / 100) * groupWidthPx.value * 10) / remPx) / 10
}

onMounted(() => {
    if (isMobile.value) return
    const groupEl: HTMLElement | undefined = groupRef.value?.$el
    if (groupEl != null) groupWidthPx.value = groupEl.getBoundingClientRect().width
    panelWidthPercent.value = calcPercent(settingsStore.mainMenuWidthRem)
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

// Section hotkeys. Browsers reserve Ctrl+number for tab switching, so the
// Ctrl+Alt variants exist for web use; plain Ctrl+number works in the Qt app.
const router = useRouter()
const { openShortcutsDialog } = useShortcutsDialog()
const SECTION_KEYS: Array<[string, string]> = [
    ['1', 'section-home'],
    ['2', 'section-cooling'],
    ['3', 'section-monitoring'],
    ['4', 'section-devices'],
    ['5', 'settings'],
    ['6', 'plugins-overview'],
]
const HOTKEY_SCOPES: string[] = []
for (const [digit, routeName] of SECTION_KEYS) {
    const combo = `ctrl+${digit},ctrl+alt+${digit}`
    HOTKEY_SCOPES.push(combo)
    hotkeys(combo, (event) => {
        if (routeName === 'plugins-overview' && deviceStore.plugins.length === 0) return
        event.preventDefault()
        router.push({ name: routeName })
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
onUnmounted(() => {
    for (const combo of HOTKEY_SCOPES) hotkeys.unbind(combo)
    hotkeys.unbind('ctrl+,')
    hotkeys.unbind('ctrl+/,ctrl+shift+/')
})
</script>

<template>
    <!--Mobile View-->
    <div v-if="isMobile" class="flex h-screen w-full flex-col bg-bg-two text-text-color">
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
        <ShellRail />
        <div class="flex min-w-0 flex-1 flex-col pb-2 pr-2">
            <ShellHeader />
            <SplitterGroup
                ref="groupRef"
                direction="horizontal"
                :keyboard-resize-by="10"
                class="min-h-0 flex-1"
            >
                <SplitterPanel
                    ref="panelRef"
                    collapsible
                    :default-size="panelWidthPercent"
                    :min-size="panelMinPercent"
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
