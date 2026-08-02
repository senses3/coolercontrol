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

// The app loads reflect-metadata via an injected script, tests must import it
// themselves before touching a model that uses class-transformer decorators.
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en.ts'
import { ChannelVerdict, verdictDocsLink } from '@/models/DeviceHealth.ts'

// The verdict labels are chosen in a switch inside the notice and badge
// components rather than read from a table, so the static i18n sweep does see
// them. These tests guard the two things the sweep cannot: that the set of
// verdicts and the set of keys stay in step, and that the docs mapping does
// not quietly lose an anchor.

const VERDICT_KEYS: Record<ChannelVerdict, string | undefined> = {
    [ChannelVerdict.Controllable]: undefined,
    [ChannelVerdict.FirmwareOverride]: 'verdictFirmwareOverride',
    [ChannelVerdict.FamilyMayNeedOutOfTree]: 'verdictFamilyMayNeedOutOfTree',
    [ChannelVerdict.NoPwm]: 'verdictNoPwm',
    [ChannelVerdict.PwmReadOnly]: 'verdictPwmReadOnly',
    [ChannelVerdict.IgnoresDuty]: 'verdictIgnoresDuty',
    [ChannelVerdict.Unverifiable]: 'verdictUnverifiable',
}

describe('channel verdicts', () => {
    it('has an english string for every verdict that needs one', () => {
        const page = (en as any).layout.shell.coolingPage
        for (const [verdict, key] of Object.entries(VERDICT_KEYS)) {
            if (key == null) continue
            expect(typeof page[key], `missing string for ${verdict}`).toBe('string')
        }
    })

    it('sends every actionable verdict to a docs anchor', () => {
        // Controllable needs no help, and Unverifiable is a gap in evidence
        // rather than a hardware limitation, so neither gets a link.
        expect(verdictDocsLink(ChannelVerdict.Controllable)).toBeUndefined()
        expect(verdictDocsLink(ChannelVerdict.Unverifiable)).toBeUndefined()
        for (const verdict of [
            ChannelVerdict.FirmwareOverride,
            ChannelVerdict.FamilyMayNeedOutOfTree,
            ChannelVerdict.NoPwm,
            ChannelVerdict.PwmReadOnly,
            ChannelVerdict.IgnoresDuty,
        ]) {
            const link = verdictDocsLink(verdict)
            expect(link, `no docs anchor for ${verdict}`).toBeDefined()
            expect(link).toContain('#')
        }
    })

    it('never names a kernel module in a verdict string', () => {
        // The app asserts observations; the docs assert remedies. A module name
        // baked into the binary goes stale and can contradict the maintainers.
        const page = (en as any).layout.shell.coolingPage
        const forbidden = ['nct6', 'it87', 'modprobe', 'lm-sensors', 'lm_sensors']
        for (const key of Object.values(VERDICT_KEYS)) {
            if (key == null) continue
            const text = String(page[key]).toLowerCase()
            for (const term of forbidden) {
                expect(text.includes(term), `${key} names "${term}"`).toBe(false)
            }
        }
    })
})
