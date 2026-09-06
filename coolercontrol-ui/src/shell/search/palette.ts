// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Open state for the palette, shared by the header trigger, the ctrl+k binding
// in ShellLayout, and the palette itself.

import { ref } from 'vue'

export const paletteOpen = ref(false)

// How it was opened, which decides where focus goes when it closes. See
// shouldRestoreFocus.
export const openedByKeyboard = ref(false)

export function openPalette(fromKeyboard: boolean = false): void {
    openedByKeyboard.value = fromKeyboard
    paletteOpen.value = true
}

/**
 * Whether closing should hand focus back to the header trigger.
 *
 * Reka restores it by default, and a close driven by Escape counts as
 * keyboard-originated, so :focus-visible paints a ring on whatever receives it.
 *
 * - Took a result: no. The user is on a new page or in another dialog; there is
 *   nothing to go back to.
 * - Opened with a mouse: no. Returning a mouse user to a ringed button leaves a
 *   marker they did not ask for and cannot clear except by clicking away.
 * - Opened from the keyboard: yes, ring and all. This is the dialog pattern, and
 *   a keyboard user who dismisses a dialog has to land somewhere they can see.
 */
export function shouldRestoreFocus(activated: boolean, fromKeyboard: boolean): boolean {
    return !activated && fromKeyboard
}
