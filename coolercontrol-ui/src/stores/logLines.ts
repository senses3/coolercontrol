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

// Log lines are escaped and highlighted once on arrival; views render the
// pre-built html per line. The cap mirrors the daemon's own log buffer so the
// UI state always looks like a fresh /logs fetch.

export const LOG_LINE_CAP = 500

export interface LogLine {
    raw: string
    html: string
}

const LEVEL_SPANS: Array<[string, string]> = [
    ['INFO', '<span class="text-success">INFO</span>'],
    ['ERROR', '<span class="text-error">ERROR</span>'],
    ['WARN', '<span class="text-warning">WARN</span>'],
    ['DEBUG', '<span class="text-info">DEBUG</span>'],
    ['TRACE', '<span class="text-pink">TRACE</span>'],
]

export function highlightLogLine(raw: string): string {
    let html = raw.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    for (const [level, span] of LEVEL_SPANS) {
        html = html.replaceAll(level, span)
    }
    return html
}

export function toLogLines(chunk: string): LogLine[] {
    return chunk
        .split('\n')
        .filter((line) => line.length > 0)
        .map((raw) => ({ raw, html: highlightLogLine(raw) }))
}

// Appends a (possibly multi-line) chunk, dropping the oldest lines past the cap.
export function appendLogChunk(lines: LogLine[], chunk: string): LogLine[] {
    const appended = [...lines, ...toLogLines(chunk)]
    return appended.length > LOG_LINE_CAP
        ? appended.slice(appended.length - LOG_LINE_CAP)
        : appended
}
