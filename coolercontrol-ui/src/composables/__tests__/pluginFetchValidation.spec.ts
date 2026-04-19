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

import { describe, it, expect } from 'vitest'
import { validatePluginFetchPath, buildSafeOptions } from '../pluginFetchValidation'

describe('validatePluginFetchPath', () => {
    it('accepts a simple path', () => {
        expect(validatePluginFetchPath('/snapshot')).toBe('/snapshot')
    })

    it('accepts a nested path', () => {
        expect(validatePluginFetchPath('/api/data')).toBe('/api/data')
    })

    it('accepts a path with query-like characters', () => {
        expect(validatePluginFetchPath('/data?key=value')).toBe('/data?key=value')
    })

    it('rejects path traversal at the start', () => {
        expect(validatePluginFetchPath('/../../../shutdown')).toBeNull()
    })

    it('rejects path traversal in the middle', () => {
        expect(validatePluginFetchPath('/foo/../bar')).toBeNull()
    })

    it('rejects dot segments', () => {
        expect(validatePluginFetchPath('/./foo')).toBeNull()
    })

    it('rejects paths without leading slash', () => {
        expect(validatePluginFetchPath('no-leading-slash')).toBeNull()
    })

    it('rejects empty string', () => {
        expect(validatePluginFetchPath('')).toBeNull()
    })

    it('rejects bare traversal', () => {
        expect(validatePluginFetchPath('/..')).toBeNull()
    })

    it('rejects protocol-relative paths', () => {
        expect(validatePluginFetchPath('//evil.com/path')).toBeNull()
    })

    it('rejects backslashes', () => {
        expect(validatePluginFetchPath('/foo\\bar')).toBeNull()
    })

    it('rejects traversal hidden behind a query string', () => {
        expect(validatePluginFetchPath('/foo/../bar?x=1')).toBeNull()
    })

    it('rejects traversal hidden behind a fragment', () => {
        expect(validatePluginFetchPath('/foo/../bar#frag')).toBeNull()
    })

    it('accepts a path with a fragment', () => {
        expect(validatePluginFetchPath('/data#section')).toBe('/data#section')
    })
})

describe('buildSafeOptions', () => {
    it('returns credentials include for empty options', () => {
        expect(buildSafeOptions({})).toEqual({ credentials: 'include' })
    })

    it('returns credentials include for null options', () => {
        expect(buildSafeOptions(null)).toEqual({ credentials: 'include' })
    })

    it('returns credentials include for undefined options', () => {
        expect(buildSafeOptions(undefined)).toEqual({ credentials: 'include' })
    })

    it('allows POST with string body', () => {
        const result = buildSafeOptions({ method: 'POST', body: '{"k":"v"}' })
        expect(result).toEqual({
            credentials: 'include',
            method: 'POST',
            body: '{"k":"v"}',
        })
    })

    it('allows GET method', () => {
        const result = buildSafeOptions({ method: 'GET' })
        expect(result).toEqual({ credentials: 'include', method: 'GET' })
    })

    it('rejects DELETE method', () => {
        const result = buildSafeOptions({ method: 'DELETE' })
        expect(result).toEqual({ credentials: 'include' })
    })

    it('rejects PUT method', () => {
        const result = buildSafeOptions({ method: 'PUT' })
        expect(result).toEqual({ credentials: 'include' })
    })

    it('rejects non-string body', () => {
        const result = buildSafeOptions({ method: 'POST', body: 123 })
        expect(result).toEqual({ credentials: 'include', method: 'POST' })
    })

    it('ignores body for GET requests', () => {
        const result = buildSafeOptions({ method: 'GET', body: 'data' })
        expect(result).toEqual({ credentials: 'include', method: 'GET' })
    })

    it('passes Content-Type and Authorization headers', () => {
        const result = buildSafeOptions({
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
        })
        expect(result).toEqual({
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
        })
    })

    it('drops non-allowlisted headers', () => {
        const result = buildSafeOptions({
            headers: {
                'Content-Type': 'application/json',
                'X-Custom': 'evil',
                Cookie: 'session=abc',
            },
        })
        expect(result).toEqual({
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
        })
    })

    it('ignores credentials override from plugin', () => {
        const result = buildSafeOptions({ credentials: 'omit' })
        expect(result.credentials).toBe('include')
    })

    it('ignores redirect, mode, referrer options', () => {
        const result = buildSafeOptions({
            redirect: 'follow',
            mode: 'no-cors',
            referrer: 'https://evil.com',
        })
        expect(result).toEqual({ credentials: 'include' })
    })

    it('handles case-insensitive method', () => {
        const result = buildSafeOptions({ method: 'post', body: 'data' })
        expect(result.method).toBe('POST')
        expect(result.body).toBe('data')
    })

    it('drops headers with non-string values', () => {
        const result = buildSafeOptions({
            headers: { 'Content-Type': 123, Authorization: null },
        })
        expect(result).toEqual({ credentials: 'include' })
    })
})
