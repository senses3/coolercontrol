// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

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
