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

/**
 * Strict allowlist for plugin fetch paths. Anchored, no metacharacters
 * that could escape origin: pathname is /[A-Za-z0-9._~/-]+, an optional
 * query of [A-Za-z0-9._~=&%/-]*, and an optional fragment.
 */
const PLUGIN_PATH_RE = /^\/[A-Za-z0-9._~/-]*(\?[A-Za-z0-9._~=&%/-]*)?(#[A-Za-z0-9._~/-]*)?$/

/**
 * Validate a plugin fetch path. Returns the sanitized path or null if invalid.
 * Rejects path traversal, protocol-relative paths, backslashes, and any
 * character outside a conservative allowlist. The strict regex bounds the
 * input so the resulting URL cannot redirect off-origin.
 */
export function validatePluginFetchPath(path: string): string | null {
    if (typeof path !== 'string' || !PLUGIN_PATH_RE.test(path)) {
        return null
    }
    if (path.startsWith('//')) {
        return null
    }
    const pathPart = path.split(/[?#]/, 1)[0]
    const segments = pathPart.split('/')
    for (const segment of segments) {
        if (segment === '..' || segment === '.') {
            return null
        }
    }
    return path
}

const ALLOWED_METHODS = new Set(['GET', 'POST'])
const ALLOWED_HEADER_NAMES = new Set(['content-type', 'authorization'])

/**
 * Build a safe RequestInit from untrusted plugin options.
 * Only allows GET/POST methods, string bodies for POST, and Content-Type/Authorization headers.
 */
export function buildSafeOptions(options: unknown): RequestInit {
    const safeOptions: RequestInit = { credentials: 'include' }
    if (options == null || typeof options !== 'object') {
        return safeOptions
    }
    const opts = options as Record<string, unknown>

    if (typeof opts.method === 'string' && ALLOWED_METHODS.has(opts.method.toUpperCase())) {
        safeOptions.method = opts.method.toUpperCase()
    }

    if (safeOptions.method === 'POST' && typeof opts.body === 'string') {
        safeOptions.body = opts.body
    }

    if (opts.headers != null && typeof opts.headers === 'object' && !Array.isArray(opts.headers)) {
        const rawHeaders = opts.headers as Record<string, unknown>
        const safeHeaders: Record<string, string> = {}
        for (const [key, value] of Object.entries(rawHeaders)) {
            if (typeof value === 'string' && ALLOWED_HEADER_NAMES.has(key.toLowerCase())) {
                safeHeaders[key] = value
            }
        }
        if (Object.keys(safeHeaders).length > 0) {
            safeOptions.headers = safeHeaders
        }
    }

    return safeOptions
}
