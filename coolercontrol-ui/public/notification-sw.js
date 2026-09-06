// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Service Worker for background desktop notifications via SSE.
// Maintains its own SSE connection via fetch() + ReadableStream so
// notifications arrive even when the browser tab is suspended.

const ICON_MAP = {
    triggered: '/icons/alert-triggered.png',
    resolved: '/icons/alert-resolved.png',
    error: '/icons/alert-error.png',
    info: '/icons/information.png',
    shutdown: '/icons/shutdown.png',
}

const MAX_RECONNECT_DELAY_MS = 30000
const BASE_RECONNECT_DELAY_MS = 1000

let controller = null
let reconnectAttempts = 0

self.addEventListener('install', () => {
    self.skipWaiting()
})

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim())
})

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'start') {
        startSSE(event.data.url)
    } else if (event.data && event.data.type === 'stop') {
        stopSSE()
    }
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            for (const client of clients) {
                if (client.url && 'focus' in client) {
                    return client.focus()
                }
            }
            return self.clients.openWindow('/')
        }),
    )
})

function stopSSE() {
    if (controller) {
        controller.abort()
        controller = null
    }
    reconnectAttempts = 0
}

async function startSSE(url) {
    stopSSE()
    controller = new AbortController()
    const signal = controller.signal

    try {
        const response = await fetch(url, {
            credentials: 'include',
            signal,
        })
        if (!response.ok || !response.body) {
            scheduleReconnect(url)
            return
        }
        reconnectAttempts = 0
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
            const { done, value } = await reader.read()
            if (done) {
                break
            }
            buffer += decoder.decode(value, { stream: true })
            const messages = buffer.split('\n\n')
            // Last element is incomplete; keep it in the buffer.
            buffer = messages.pop() || ''

            for (const message of messages) {
                processSSEMessage(message)
            }
        }
        // Stream closed by server; reconnect.
        scheduleReconnect(url)
    } catch (err) {
        if (signal.aborted) {
            return
        }
        scheduleReconnect(url)
    }
}

function processSSEMessage(raw) {
    let eventType = ''
    let data = ''
    for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) {
            eventType = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
            data += line.slice(5).trim()
        }
    }
    if (eventType !== 'notification' || data.length === 0) {
        return
    }
    let notification
    try {
        notification = JSON.parse(data)
    } catch (_) {
        return
    }
    const iconKey = notification.icon || 'info'
    const iconUrl = ICON_MAP[iconKey] || ICON_MAP['info']
    const tag = `cc-${iconKey}-${Date.now()}`
    self.registration.showNotification(notification.title || 'CoolerControl', {
        body: notification.body || '',
        icon: iconUrl,
        badge: '/icons/information.png',
        tag,
        silent: !notification.audio,
        requireInteraction: notification.urgency >= 2,
    })
}

function scheduleReconnect(url) {
    const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts),
        MAX_RECONNECT_DELAY_MS,
    )
    reconnectAttempts++
    setTimeout(() => startSSE(url), delay)
}
