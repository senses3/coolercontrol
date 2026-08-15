// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { UiMode } from '@/models/UISettings.ts'

export interface TourStep {
    selector: string
    // Names `components.onboarding.<key>` and `<key>Desc`. Kept in a list the
    // tests can walk: the tour builds those keys dynamically, so nothing else
    // ties them to the locale files.
    key: string
    placement?: string
}

export const TOUR_KEY_PREFIX = 'components.onboarding.'

// The full interface's tour walks the navigation rail (the shell's primary nav)
// plus the header's Modes switcher and interface switch. Section steps fold in
// concepts that used to have their own old-shell menu items (profiles/functions
// -> Cooling, dashboards/alerts -> Monitoring, lighting/LCD/custom sensors ->
// Devices).
export const TOUR_STEPS: readonly TourStep[] = Object.freeze([
    { selector: '#rail-home', key: 'home' },
    { selector: '#rail-cooling', key: 'cooling' },
    { selector: '#rail-monitoring', key: 'monitoring' },
    { selector: '#rail-devices', key: 'devices' },
    { selector: '#rail-plugins', key: 'plugins' },
    { selector: '#rail-settings', key: 'settings' },
    { selector: '#access', key: 'access' },
    { selector: '#restart', key: 'restartMenu' },
    // Modes trails the rest: useful, but the least reached for day to day.
    { selector: '#modes-switcher', key: 'modes', placement: 'left-start' },
    { selector: '#ui-mode-switch', key: 'interfaceMode', placement: 'bottom-end' },
])

// The simple interface's own tour. Not the full one filtered down: simple mode
// names the same two sections Fans and Sensors, and neither holds the profiles,
// dashboards or alerts the full descriptions promise.
export const SIMPLE_TOUR_STEPS: readonly TourStep[] = Object.freeze([
    { selector: '#rail-home', key: 'simpleHome' },
    { selector: '#rail-cooling', key: 'simpleFans' },
    { selector: '#rail-monitoring', key: 'simpleSensors' },
    { selector: '#rail-settings', key: 'settings' },
    { selector: '#ui-mode-switch', key: 'interfaceMode', placement: 'bottom-end' },
])

export function tourStepsFor(mode: UiMode): readonly TourStep[] {
    return mode === UiMode.SIMPLE ? SIMPLE_TOUR_STEPS : TOUR_STEPS
}
