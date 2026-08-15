// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// The daemon rejects an over-long name and the UI has no toast for that
// failure: the fork button just appears to do nothing. So the budget is
// enforced here, in bytes, for every script the app ships a locale for.

import { describe, expect, it } from 'vitest'
import { fitProfileName, MAX_NAME_BYTES } from '@/shell/cooling/profileNames.ts'

const byteLength = (value: string): number => new TextEncoder().encode(value).length

describe('fitProfileName', () => {
    it('appends the suffix untouched when the name fits', () => {
        expect(fitProfileName('Pump 2-Speed LiqCpuDelta', ' (calibrated)')).toBe(
            'Pump 2-Speed LiqCpuDelta (calibrated)',
        )
    })

    it('keeps every result within the daemon byte limit', () => {
        const cases = [
            ['Silent Pump Curve With A Very Long Name', ' (Pump/AIO Coolant Loop)'],
            ['ポンプ2速リキッドCPUデルタカーブ設定', ' (キャリブレーション済み)'],
            ['Кривая насоса с очень длинным именем', ' (откалиброван)'],
            ['منحنى المضخة بسرعتين مع اسم طويل جدا', ' (معايَرة)'],
        ]
        for (const [source, suffix] of cases) {
            const name = fitProfileName(source, suffix)
            expect(byteLength(name)).toBeLessThanOrEqual(MAX_NAME_BYTES)
            expect(name.endsWith(suffix.trimStart())).toBe(true)
        }
    })

    it('cuts the source name rather than the qualifier', () => {
        const name = fitProfileName('Silent Pump Curve With A Very Long Name', ' (calibrated)')
        expect(name).toBe('Silent Pump Curve With A Very Long… (calibrated)')
        expect(byteLength(name)).toBe(MAX_NAME_BYTES)
    })

    it('marks the cut and does not leave a dangling space before it', () => {
        const name = fitProfileName('Silent Pump Curve With A Very Big Long Name', ' (calibrated)')
        expect(name).toBe('Silent Pump Curve With A Very Big… (calibrated)')
        expect(name).not.toContain(' …')
    })

    it('never splits a multi-byte character', () => {
        // Each kana is 3 bytes, so a byte-wise cut would land mid-character.
        const name = fitProfileName('あいうえおかきくけこさしすせそたちつてと', ' (calibrated)')
        expect(byteLength(name)).toBeLessThanOrEqual(MAX_NAME_BYTES)
        expect(name).not.toContain('�')
        expect([...name].every((char) => char.codePointAt(0) !== 0xfffd)).toBe(true)
    })

    it('keeps a surrogate pair whole', () => {
        const name = fitProfileName('🐧🐧🐧🐧🐧🐧🐧🐧🐧🐧🐧🐧🐧', ' (calibrated)')
        expect(byteLength(name)).toBeLessThanOrEqual(MAX_NAME_BYTES)
        for (const char of name) expect(char.length === 1 || char.length === 2).toBe(true)
        expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(name)).toBe(false)
    })

    it('drops the source entirely when the qualifier alone fills the budget', () => {
        const suffix = ` (${'Very Long Custom Channel Label Indeed'})`
        const name = fitProfileName('Pump Curve', suffix)
        expect(byteLength(name)).toBeLessThanOrEqual(MAX_NAME_BYTES)
        expect(name.startsWith(' ')).toBe(false)
        expect(name.length).toBeGreaterThan(0)
    })

    it('fits the numbered candidate a clash falls back to', () => {
        const name = fitProfileName('Silent Pump Curve With A Very Long Name', ' (calibrated) 99')
        expect(byteLength(name)).toBeLessThanOrEqual(MAX_NAME_BYTES)
        expect(name.endsWith('(calibrated) 99')).toBe(true)
    })
})
