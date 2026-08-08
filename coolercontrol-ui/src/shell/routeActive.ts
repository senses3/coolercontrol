// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Is a row's target the page currently open?
 *
 * `exact-active-class` answers this on a RouterLink, but an entity row's link
 * is only its left half: the live value and the hover actions are siblings
 * inside the row wrapper. Styling the row therefore has to ask the question
 * from the wrapper instead.
 */

import {
    useRoute,
    useRouter,
    type RouteLocationRaw,
    type RouteParams,
    type RouteRecordName,
} from 'vue-router'

interface Target {
    name?: RouteRecordName | null
    params: RouteParams
}

const sameParam = (a: RouteParams[string], b: RouteParams[string]): boolean =>
    Array.isArray(a) || Array.isArray(b)
        ? JSON.stringify(a) === JSON.stringify(b)
        : String(a) === String(b)

/**
 * Same route record and same params, which is what vue-router calls exactly
 * active. Query is ignored, as it is there.
 */
export function isSameTarget(current: Target, target: Target): boolean {
    if (target.name == null || current.name !== target.name) return false
    for (const key of Object.keys(target.params)) {
        if (!sameParam(current.params[key], target.params[key])) return false
    }
    return true
}

export function useRouteActive(): (to: RouteLocationRaw) => boolean {
    const route = useRoute()
    const router = useRouter()
    return (to: RouteLocationRaw): boolean => isSameTarget(route, router.resolve(to))
}
