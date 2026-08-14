// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Color } from '@/models/Device.ts'

// The chart tooltip is assembled as a markup string and assigned to innerHTML, so anything
// interpolated into it has to be neutralised first. A line name is a sensor or channel
// label, which reaches us from hwmon, a liquidctl device, a service plugin or the user's
// own name overrides, none of which are trusted to be markup-free.
export function escapeHtml(text: string | undefined): string {
    return (text ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
}

// The colour lands inside a style attribute, where escaping is not enough: a value that is
// not a colour could still close the declaration. Only the forms the picker produces are
// allowed through, and anything else falls back to the chart's default line colour.
const COLOR_PATTERN = /^(#[0-9a-f]{3,8}|rgba?\([0-9.,\s%]+\)|hsla?\([0-9.,\s%deg]+\))$/i

export function safeColor(color: Color | undefined): string {
    return color != null && COLOR_PATTERN.test(color) ? color : 'currentColor'
}
