// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Plain-DOM loading overlay replacing the Element Plus loading service (it
// was the last element-plus consumer). Framework-free so stores can use it.

import { svgLoader, svgLoaderViewBox } from '@/models/Loader.ts'

export interface LoadingOverlayHandle {
    close: () => void
}

export interface LoadingOverlayOptions {
    text?: string
    /** CSS selector; defaults to a full-screen overlay. */
    target?: string
    background?: string
}

export function showLoadingOverlay(options: LoadingOverlayOptions = {}): LoadingOverlayHandle {
    const host = (options.target && document.querySelector(options.target)) || document.body
    const fullscreen = host === document.body

    // Tailwind classes rather than inline styles so this stays in step with
    // ConnectionLostOverlay.vue, which is the same screen in Vue form. Only the
    // caller-supplied background stays inline. Above that overlay's z-[1500] on
    // purpose: the Qt reconnect path stacks its "Restarting..." screen over it.
    const overlay = document.createElement('div')
    overlay.setAttribute(
        'class',
        `${fullscreen ? 'fixed' : 'absolute'} inset-0 z-[9999] flex flex-col ` +
            'items-center justify-center gap-3 px-6 text-center',
    )
    overlay.style.background = options.background ?? 'rgb(var(--colors-bg-one))'

    // setAttribute, not className: an SVG element's className is an
    // SVGAnimatedString and cannot be assigned.
    const spinner = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    spinner.setAttribute('viewBox', svgLoaderViewBox.replaceAll(',', ' '))
    spinner.setAttribute('class', 'h-16 w-16')
    // static compile-time constant, never user input
    spinner.innerHTML = svgLoader
    overlay.appendChild(spinner)

    if (options.text) {
        const label = document.createElement('span')
        label.textContent = options.text
        label.setAttribute('class', 'text-lg text-accent')
        overlay.appendChild(label)
    }

    if (!fullscreen && getComputedStyle(host).position === 'static') {
        ;(host as HTMLElement).style.position = 'relative'
    }
    host.appendChild(overlay)

    return {
        close: () => {
            overlay.remove()
        },
    }
}
