// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import type { RouteMeta } from 'vue-router'
import { UiMode } from '@/models/UISettings.ts'
import { sectionsFor } from '@/shell/sections.ts'

/**
 * Where switching the interface leaves the user.
 *
 * Switching is not navigation, so a page the chosen interface owns is kept: a
 * fan page, a sensor chart and Settings all read the same in either one. A page
 * it does not own would otherwise sit inside a shell with no way back to it, so
 * it falls back to that page's own section, and to Home when the chosen
 * interface has no such section. Only the switch consults this; deep links
 * still resolve anywhere in either interface.
 *
 * Returns undefined to stay put. The full interface always does: it owns every
 * page the simple one has.
 */
export function routeAfterUiModeSwitch(uiMode: UiMode, meta: RouteMeta): string | undefined {
    if (uiMode !== UiMode.SIMPLE) return undefined
    if (meta.simple === true) return undefined
    const section = sectionsFor(UiMode.SIMPLE).find((candidate) => candidate.id === meta.section)
    return section?.routeName ?? 'section-home'
}
