// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Open state for the palette, shared by the header trigger, the ctrl+k binding
// in ShellLayout, and the palette itself.

import { ref } from 'vue'

export const paletteOpen = ref(false)

export function openPalette(): void {
    paletteOpen.value = true
}
