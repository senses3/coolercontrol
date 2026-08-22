// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

export interface TourStep {
    selector: string
    // Names `components.onboarding.<key>` and `<key>Desc`. Kept in a list the
    // tests can walk: the tour builds those keys dynamically, so nothing else
    // ties them to the locale files.
    key: string
    placement?: string
}

export const TOUR_KEY_PREFIX = 'components.onboarding.'

// The one walk, over the navigation rail (the shell's primary nav) plus the
// header's Modes switcher. Section steps fold in concepts that used to have
// their own old-shell menu items (profiles/functions -> Cooling,
// dashboards/alerts -> Monitoring, lighting/LCD/custom sensors -> Devices).
// The caller drops any anchor the current shell does not render, so the simple
// interface gets the subset of this that it has rather than a walk of its own.
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
])
