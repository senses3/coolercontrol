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

// The Qt app renders some UI of its own (dialogs, tray) but has no translation
// pipeline, so those strings would be English-only while the SPA ships 12 locales.
// Rather than run a second Linguist pipeline that translators would have to keep in
// sync, the SPA pushes the strings Qt needs and Qt caches them. The cache is required
// anyway: once the renderer is discarded to the tray there is nobody left to ask.
//
// Keys are written out one per line on purpose. An unused-key sweep only sees literal
// translate calls, so building these from a template literal would get them pruned.

/** Keys Qt looks up. Kept in sync with the C++ side by qtStringKeys.spec.ts. */
export const QT_STRING_KEYS = [
    'closePrompt.title',
    'closePrompt.body',
    'closePrompt.keepInTray',
    'closePrompt.quit',
    'closePrompt.remember',
] as const

type Translate = (key: string) => string

export function buildQtStrings(t: Translate): Record<string, string> {
    return {
        'closePrompt.title': t('desktop.closePrompt.title'),
        'closePrompt.body': t('desktop.closePrompt.body'),
        'closePrompt.keepInTray': t('desktop.closePrompt.keepInTray'),
        'closePrompt.quit': t('desktop.closePrompt.quit'),
        'closePrompt.remember': t('desktop.closePrompt.remember'),
    }
}
