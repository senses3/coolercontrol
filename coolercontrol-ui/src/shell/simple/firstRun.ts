// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { UiMode } from '@/models/UISettings.ts'

/**
 * Which interface a config that has never chosen one opens in.
 *
 * A config with no profiles and no dashboards of the user's own has never been
 * set up, so whoever owns it is meeting CoolerControl for the first time and
 * meets it in simple mode. Anyone with a setup already keeps the full
 * interface, which is the one they built it in.
 *
 * Counts, not booleans, because both callers count: the default profile and the
 * default dashboards ship with every config and are not the user's own.
 */
export function firstRunUiMode(userProfileCount: number, userDashboardCount: number): UiMode {
    return userProfileCount === 0 && userDashboardCount === 0 ? UiMode.SIMPLE : UiMode.FULL
}
