// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// UISettings.ts pulls in Dashboard.ts, whose class-transformer decorators need
// the polyfill.
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { UiMode } from '@/models/UISettings.ts'
import { firstRunUiMode } from '@/shell/simple/firstRun.ts'

describe('first run interface mode', () => {
    it('starts an untouched config in simple mode', () => {
        expect(firstRunUiMode(0, 0)).toBe(UiMode.SIMPLE)
    })

    // Anything the user built belongs to the full interface, and that is where
    // they built it.
    it('keeps a config with a setup in the full interface', () => {
        expect(firstRunUiMode(1, 0)).toBe(UiMode.FULL)
        expect(firstRunUiMode(0, 1)).toBe(UiMode.FULL)
        expect(firstRunUiMode(3, 2)).toBe(UiMode.FULL)
    })
})
