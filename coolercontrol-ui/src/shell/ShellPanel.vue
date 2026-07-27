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

// Channel routes name their target the same way in both sections
// (cooling/:deviceUID/:channelName and monitoring/sensors/:deviceUID/:channelName),
// so match on that pair rather than on the href: a panel entry links to the
// channel's canonical page, which for a fan is Cooling even in the Monitoring
// panel, so Full chart's monitoring route would otherwise find nothing.
const entriesForRoute = (root: HTMLElement): Element[] => {
    const { deviceUID, channelName } = route.params
    if (typeof deviceUID === 'string' && typeof channelName === 'string') {
        const raw = `/${deviceUID}/${channelName}`
        const encoded = `/${encodeURIComponent(deviceUID)}/${encodeURIComponent(channelName)}`
        const matches = [...root.querySelectorAll('a[href]')].filter((link) => {
            const href = link.getAttribute('href') ?? ''
            return href.endsWith(raw) || href.endsWith(encoded)
        })
        if (matches.length > 0) return matches
    }
    return [...root.querySelectorAll('[aria-current="page"]')]
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

// Only ensure that one entry for this page is on screen. A page can have several
// entries (pinned plus its device group), so scrolling to the first would yank
// the list to the pinned copy whenever the one actually clicked was already
// visible.
const revealActiveEntry = async (): Promise<void> => {
    await nextTick()
    const root = panelRef.value
    if (root == null) return
    const entries = entriesForRoute(root)
    if (entries.length === 0) return
    if (entries.some(isInView)) return
    // Centred rather than 'nearest': nearest parks the entry flush against an
    // edge, which is exactly where the fade is.
    entries[0].scrollIntoView({ block: 'center' })
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
            <UiScrollArea>
                <HomePanel v-if="section.id === 'home'" />
                <CoolingPanel v-else-if="section.id === 'cooling'" />
                <MonitoringPanel v-else-if="section.id === 'monitoring'" />
                <DevicesPanel v-else-if="section.id === 'devices'" />
                <PluginsPanel v-else-if="section.id === 'plugins'" />
                <SettingsPanel v-else-if="section.id === 'settings'" />
                <div v-else />
            </UiScrollArea>
        </template>
    </div>
</template>
