<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiCog, mdiDockLeft, mdiLockOutline, mdiPower } from '@mdi/js'
import { computed, inject, reactive } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { PLUGINS_SECTION, type SectionId, sectionsFor, startupRouteName } from '@/shell/sections.ts'
import UiDropdownMenu from '@/shell/ui/UiDropdownMenu.vue'
import ShellRailLabel from '@/shell/ShellRailLabel.vue'
import ShellAccessMenuItems from '@/shell/ShellAccessMenuItems.vue'
import ShellPowerMenuItems from '@/shell/ShellPowerMenuItems.vue'
import { registerLogoTap } from '@/shell/supportWizards.ts'
import { useToast } from '@/shell/toast'

const route = useRoute()
const { t } = useI18n()
const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()

// Settings is docked at the rail bottom (below), so it is dropped from the top list.
// Plugins is always shown so its overview (a getting-started page) stays discoverable
// even before any plugin is installed. Simple mode has no Plugins section.
const railSections = computed(() => {
    const sections = sectionsFor(settingsStore.uiMode).filter(
        (section) => section.id !== 'settings',
    )
    return settingsStore.isSimpleMode ? sections : [...sections, PLUGINS_SECTION]
})
const activeSection = computed(() => route.meta.section as SectionId | undefined)

// A label clips when its translation outgrows the rail, and the tooltip is the
// only way to read the whole word. It hangs off the rail item rather than the
// label so that hovering the icon reveals it too, which means the item has to
// be told what its own label did.
const truncatedLabels = reactive(new Set<string>())
const onTruncated = (key: string, truncated: boolean): void => {
    if (truncated) truncatedLabels.add(key)
    else truncatedLabels.delete(key)
}
const labelTooltip = (key: string, label: string) => ({
    value: label,
    disabled: !truncatedLabels.has(key),
})

// The logo resets to the configured startup page, which is what sets it apart
// from the Home rail button. Resolved here rather than in the `startup-page`
// route because that runs outside a component, where the store cannot be built.
// Simple mode boots to Home whatever the setting says, so the logo goes there too.
const startupTarget = computed(() => ({
    name: settingsStore.isSimpleMode ? 'section-home' : startupRouteName(settingsStore.startupPage),
}))

// Provided by ShellLayout; toggles the menu panel, same as the header button.
const toggleMainMenu = inject<() => void>('toggleMainMenu')

// Hidden tribute: a run of taps here turns every fan glyph into a wizard hat.
// The navigation the link already does is left alone, so a user who never finds
// this only ever sees the logo behave the way it always has.
const toast = useToast()
const onLogoTap = (): void => {
    if (!registerLogoTap()) return
    toast.add({
        severity: 'info',
        summary: t('layout.shell.supportWizards.summary'),
        detail: t('layout.shell.supportWizards.detail'),
        life: 8000,
    })
}
</script>

<template>
    <nav class="flex h-full w-[5.5rem] flex-col items-center gap-1 py-2 pl-1.5 pr-1">
        <RouterLink
            id="logo"
            :to="startupTarget"
            class="group rounded-lg p-1 outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
            @click="onLogoTap"
        >
            <!-- The glyph is a single gradient path, so cycling the hue on the
                 image matches what the old animated variant did to the path.
                 The identity filter is the resting state the transition eases
                 back to when the pointer leaves mid-cycle; without it the base
                 is `none`, which the transition would fight over on hover-in. -->
            <img
                src="/logo.svg"
                alt="CoolerControl"
                class="h-10 w-10 [filter:hue-rotate(0deg)] transition-[filter] duration-300 motion-safe:group-hover:animate-hue-rotate"
            />
        </RouterLink>
        <RouterLink
            v-for="section in railSections"
            :id="`rail-${section.id}`"
            :key="section.id"
            :to="{ name: section.routeName }"
            v-tooltip.right="labelTooltip(section.id, t(section.labelKey))"
            class="relative flex w-full flex-col items-center gap-0.5 rounded-lg py-2 outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
            :class="
                activeSection === section.id
                    ? 'text-accent'
                    : 'text-text-color-secondary hover:text-text-color'
            "
        >
            <!-- Brand mark for the current section. A theme whose gradient end
                 equals its accent renders this as a plain accent bar. -->
            <span
                v-if="activeSection === section.id"
                class="absolute inset-y-1.5 -left-1 w-[2px] rounded-full bg-gradient-to-b from-accent to-accent-gradient-to"
            />
            <svg-icon type="mdi" :path="section.icon" :size="deviceStore.getREMSize(1.5)" />
            <ShellRailLabel
                :label="t(section.labelKey)"
                :font-key="settingsStore.interfaceFont"
                @update:truncated="onTruncated(section.id, $event)"
            />
        </RouterLink>
        <!-- The rail's empty space doubles as a collapse target when asked for.
             The icon rests in the rail's own background color, so it reads as blank
             space until hovered. Simple mode renders no panel to toggle. -->
        <button
            v-if="settingsStore.hideMenuCollapseIcon && !settingsStore.isSimpleMode"
            id="rail-collapse"
            type="button"
            v-tooltip.right="
                settingsStore.collapsedMainMenu
                    ? t('layout.topbar.expandMenu')
                    : t('layout.topbar.collapseMenu')
            "
            class="flex w-full flex-1 items-center justify-center rounded-lg text-bg-two outline-none hover:text-text-color-secondary/50 focus-visible:ring-2 focus-visible:ring-accent"
            @click="toggleMainMenu?.()"
        >
            <svg-icon type="mdi" :path="mdiDockLeft" :size="deviceStore.getREMSize(1.5)" />
        </button>
        <div v-else class="flex-1" />
        <RouterLink
            id="rail-settings"
            :to="{ name: 'settings' }"
            v-tooltip.right="labelTooltip('settings', t('layout.shell.settings'))"
            class="relative flex w-full flex-col items-center gap-0.5 rounded-lg py-2 outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
            :class="
                activeSection === 'settings'
                    ? 'text-accent'
                    : 'text-text-color-secondary hover:text-text-color'
            "
        >
            <span
                v-if="activeSection === 'settings'"
                class="absolute inset-y-1.5 -left-1 w-[2px] rounded-full bg-gradient-to-b from-accent to-accent-gradient-to"
            />
            <svg-icon type="mdi" :path="mdiCog" :size="deviceStore.getREMSize(1.5)" />
            <ShellRailLabel
                :label="t('layout.shell.settings')"
                :font-key="settingsStore.interfaceFont"
                @update:truncated="onTruncated('settings', $event)"
            />
        </RouterLink>
        <!-- Both menus hang off the rail rather than over it. They are docked at the
             rail bottom, so `end` bottom-aligns them with their trigger. -->
        <UiDropdownMenu side="right" align="end" :side-offset="8">
            <template #trigger>
                <button
                    id="access"
                    type="button"
                    v-tooltip.right="labelTooltip('access', t('layout.shell.access'))"
                    class="flex w-full flex-col items-center gap-0.5 rounded-lg py-2 text-text-color-secondary outline-none hover:bg-surface-hover hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                >
                    <svg-icon
                        type="mdi"
                        :path="mdiLockOutline"
                        :size="deviceStore.getREMSize(1.5)"
                    />
                    <ShellRailLabel
                        :label="t('layout.shell.access')"
                        :font-key="settingsStore.interfaceFont"
                        @update:truncated="onTruncated('access', $event)"
                    />
                </button>
            </template>
            <ShellAccessMenuItems />
        </UiDropdownMenu>
        <UiDropdownMenu side="right" align="end" :side-offset="8">
            <template #trigger>
                <button
                    id="restart"
                    type="button"
                    v-tooltip.right="labelTooltip('power', t('layout.shell.power'))"
                    class="flex w-full flex-col items-center gap-0.5 rounded-lg py-2 text-text-color-secondary outline-none hover:bg-surface-hover hover:text-text-color focus-visible:ring-2 focus-visible:ring-accent"
                >
                    <svg-icon type="mdi" :path="mdiPower" :size="deviceStore.getREMSize(1.5)" />
                    <ShellRailLabel
                        :label="t('layout.shell.power')"
                        :font-key="settingsStore.interfaceFont"
                        @update:truncated="onTruncated('power', $event)"
                    />
                </button>
            </template>
            <ShellPowerMenuItems />
        </UiDropdownMenu>
    </nav>
</template>
