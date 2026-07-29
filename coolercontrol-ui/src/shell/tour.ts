/*
 * CoolerControl - monitor and control your cooling and other devices
 * Copyright (c) 2021-2025  Guy Boldon and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

export interface TourStep {
    selector: string
    // Names `components.onboarding.<key>` and `<key>Desc`. Kept in a list the
    // tests can walk: the tour builds those keys dynamically, so nothing else
    // ties them to the locale files.
    key: string
    placement?: string
}

export const TOUR_KEY_PREFIX = 'components.onboarding.'

// A single tour walks the navigation rail (the new shell's primary nav) plus
// the header Modes switcher. Section steps fold in concepts that used to have
// their own old-shell menu items (profiles/functions -> Cooling, dashboards/
// alerts -> Monitoring, lighting/LCD/custom sensors -> Devices).
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
