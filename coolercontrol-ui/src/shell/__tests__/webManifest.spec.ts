// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Nothing in the build reads the manifest: it is copied verbatim out of public/, so a
// typo or a renamed icon would ship as a silently un-installable app and only surface
// as a bug report. These lock the fields browsers require and the icons it names.

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// public/ is copied verbatim by Vite, so it is not in the module graph and
// import.meta.glob cannot reach it.
const publicDir = join(dirname(fileURLToPath(import.meta.url)), '../../../public')
const manifest = JSON.parse(readFileSync(join(publicDir, 'manifest.webmanifest'), 'utf-8'))

describe('web app manifest', () => {
    it('declares the fields browsers require to offer installation', () => {
        expect(manifest.name).toBe('CoolerControl Web UI')
        expect(manifest.start_url).toBe('/')
        expect(manifest.scope).toBe('/')
        expect(manifest.display).toBe('standalone')
        const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes)
        expect(sizes).toContain('192x192')
        expect(sizes).toContain('512x512')
        expect(
            manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable'),
        ).toBe(true)
    })

    // The desktop app's launcher entry is plain "CoolerControl". Matching it would put
    // two indistinguishable entries in the launcher for anyone running both.
    it('does not collide with the desktop app entry', () => {
        expect(manifest.name).not.toBe('CoolerControl')
    })

    it('names only icons that exist', () => {
        for (const icon of manifest.icons) {
            expect(icon.src.startsWith('/')).toBe(true)
            expect(existsSync(join(publicDir, icon.src))).toBe(true)
        }
    })
})
