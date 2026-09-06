<!--
  SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { sectionById, type SectionId } from '@/shell/sections.ts'
import CoolingPanel from '@/shell/cooling/CoolingPanel.vue'
import HomePanel from '@/shell/home/HomePanel.vue'
import MonitoringPanel from '@/shell/monitoring/MonitoringPanel.vue'
import DevicesPanel from '@/shell/devices/DevicesPanel.vue'
import PluginsPanel from '@/shell/plugins/PluginsPanel.vue'
import SettingsPanel from '@/shell/settings/SettingsPanel.vue'
import UiScrollArea from '@/shell/ui/UiScrollArea.vue'
import UiSeparator from '@/shell/ui/UiSeparator.vue'

const route = useRoute()
const { t } = useI18n()
const section = computed(() => {
    const id = route.meta.section as SectionId | undefined
    return id != null ? sectionById(id) : undefined
})

// Every section shares this one scroll area, so arriving from another section
// (Monitoring -> Cooling, or a Full chart link back) leaves the list sitting at
// the previous section's offset, with the page you just opened off-screen.
const panelRef = ref<HTMLElement>()

// Pinned rows are shortcuts that keep pointing at a channel's canonical page,
// so they are a stale match on any other page, and even on the canonical one
// they are not where the entry lives. Ignoring them means a channel reveals the
// same way whether or not it happens to be pinned.
const notPinned = (element: Element): boolean => element.closest('[data-panel-pinned]') == null

// Channel routes name their target the same way in both sections
// (cooling/:deviceUID/:channelName and monitoring/sensors/:deviceUID/:channelName),
// so match on that pair rather than on the href: a panel entry may link to the
// channel's canonical page in the other section, which an href match would miss.
const entriesForRoute = (root: HTMLElement): Element[] => {
    const { deviceUID, channelName } = route.params
    if (typeof deviceUID === 'string' && typeof channelName === 'string') {
        const raw = `/${deviceUID}/${channelName}`
        const encoded = `/${encodeURIComponent(deviceUID)}/${encodeURIComponent(channelName)}`
        const matches = [...root.querySelectorAll('a[href]')].filter((link) => {
            const href = link.getAttribute('href') ?? ''
            return (href.endsWith(raw) || href.endsWith(encoded)) && notPinned(link)
        })
        if (matches.length > 0) return matches
    }
    return [...root.querySelectorAll('[aria-current="page"]')].filter(notPinned)
}

const scrollParent = (element: Element): Element | undefined => {
    let node = element.parentElement
    while (node != null) {
        if (node.scrollHeight > node.clientHeight + 1) return node
        node = node.parentElement
    }
    return undefined
}

// The scroll area washes out its top and bottom edges, so an entry sitting in
// those bands is technically inside the viewport but hard to read. Measure the
// fades rather than repeating their heights, which differ top from bottom.
const fadeHeight = (container: Element, edge: 'top' | 'bottom'): number => {
    const fade = container.parentElement?.querySelector(`[data-fade="${edge}"]`)
    return fade?.getBoundingClientRect().height ?? 0
}

const isInView = (element: Element): boolean => {
    const container = scrollParent(element)
    if (container == null) return true
    const bounds = element.getBoundingClientRect()
    const view = container.getBoundingClientRect()
    return (
        bounds.top >= view.top + fadeHeight(container, 'top') &&
        bounds.bottom <= view.bottom - fadeHeight(container, 'bottom')
    )
}

// scrollIntoView also scrolls every scrollable ancestor, and the splitter panel
// counts as one (reka gives it overflow: hidden), which took the panel heading
// off screen. Scroll the entry's own container instead, centred rather than
// flush to an edge: an edge is exactly where the fade is.
const centreInView = (element: Element): void => {
    const container = scrollParent(element)
    if (container == null) return
    const bounds = element.getBoundingClientRect()
    const view = container.getBoundingClientRect()
    container.scrollTop += bounds.top - view.top - (container.clientHeight / 2 - bounds.height / 2)
}

// Only ensure an entry for this page is on screen; never move the list when one
// already is. Clicking inside a panel would otherwise re-scroll under the user.
const revealActiveEntry = async (): Promise<void> => {
    await nextTick()
    const root = panelRef.value
    if (root == null) return
    const entries = entriesForRoute(root)
    if (entries.length === 0) return
    if (entries.some(isInView)) return
    centreInView(entries[0])
}
watch(() => route.fullPath, revealActiveEntry)
onMounted(revealActiveEntry)
</script>

<template>
    <div ref="panelRef" class="flex h-full flex-col">
        <template v-if="section != null">
            <div class="px-3 py-2 text-lg font-medium text-text-color">
                {{ t(section.labelKey) }}
            </div>
            <UiSeparator />
            <!-- min-h-0 flex-1: h-full alone makes the scroll area's flex base and
                 its automatic minimum the full panel height, so the heading pushes
                 the column past the splitter panel, which clips it. -->
            <div class="min-h-0 flex-1">
                <UiScrollArea>
                    <HomePanel v-if="section.id === 'home'" />
                    <CoolingPanel v-else-if="section.id === 'cooling'" />
                    <MonitoringPanel v-else-if="section.id === 'monitoring'" />
                    <DevicesPanel v-else-if="section.id === 'devices'" />
                    <PluginsPanel v-else-if="section.id === 'plugins'" />
                    <SettingsPanel v-else-if="section.id === 'settings'" />
                    <div v-else />
                </UiScrollArea>
            </div>
        </template>
    </div>
</template>
