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

import {
    type Profile,
    ProfileType,
    getProfileMixFunctionTypeDisplayName,
    getProfileTypeDisplayName,
} from '@/models/Profile.ts'

export type FlowKind = 'profile' | 'function' | 'tempSource'

export interface FlowNode {
    kind: FlowKind
    label: string
    detail?: string
    children: Array<FlowNode>
}

export interface FlowRow {
    kind: FlowKind
    label: string
    detail?: string
    depth: number
}

// Builds the full influence tree feeding a channel from its selected profile:
// Mix/Overlay members recurse (each with their own sensor + function), a Graph
// or Fixed profile carries its temp source + function. Guards against cycles.
export function buildFlowTree(
    profile: Profile,
    profiles: Array<Profile>,
    functionName: (functionUID: string) => string | undefined,
    tempSourceLabel: (deviceUID: string, tempName: string) => string,
    seen: Set<string> = new Set(),
): FlowNode {
    const node: FlowNode = {
        kind: 'profile',
        label: profile.name,
        detail: profileDetail(profile),
        children: [],
    }
    if (seen.has(profile.uid)) return node
    seen.add(profile.uid)
    for (const memberUID of profile.member_profile_uids) {
        const member = profiles.find((candidate) => candidate.uid === memberUID)
        if (member != null) {
            node.children.push(buildFlowTree(member, profiles, functionName, tempSourceLabel, seen))
        }
    }
    if (profile.temp_source != null) {
        node.children.push({
            kind: 'tempSource',
            label: tempSourceLabel(profile.temp_source.device_uid, profile.temp_source.temp_name),
            children: [],
        })
    }
    const name = functionName(profile.function_uid)
    if (name != null) node.children.push({ kind: 'function', label: name, children: [] })
    return node
}

function profileDetail(profile: Profile): string | undefined {
    if (profile.p_type === ProfileType.Mix) {
        return profile.mix_function_type != null
            ? getProfileMixFunctionTypeDisplayName(profile.mix_function_type)
            : undefined
    }
    if (profile.p_type === ProfileType.Overlay) {
        return getProfileTypeDisplayName(ProfileType.Overlay)
    }
    return undefined
}

export function flattenFlow(node: FlowNode, depth = 0, rows: Array<FlowRow> = []): Array<FlowRow> {
    rows.push({ kind: node.kind, label: node.label, detail: node.detail, depth })
    for (const child of node.children) flattenFlow(child, depth + 1, rows)
    return rows
}

// Only worth an expander when there is more than the flat sensor/profile/function
// chain, i.e. a composite profile whose members carry their own inputs.
export function isFlowExpandable(node: FlowNode): boolean {
    return node.children.some((child) => child.kind === 'profile')
}
