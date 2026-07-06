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

    const overlay = document.createElement('div')
    overlay.style.position = fullscreen ? 'fixed' : 'absolute'
    overlay.style.inset = '0'
    overlay.style.zIndex = '9999'
    overlay.style.display = 'flex'
    overlay.style.flexDirection = 'column'
    overlay.style.alignItems = 'center'
    overlay.style.justifyContent = 'center'
    overlay.style.gap = '0.75rem'
    overlay.style.background = options.background ?? 'rgb(var(--colors-bg-one))'

    const spinner = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    spinner.setAttribute('viewBox', svgLoaderViewBox.replaceAll(',', ' '))
    spinner.setAttribute('width', '50')
    spinner.setAttribute('height', '50')
    // static compile-time constant, never user input
    spinner.innerHTML = svgLoader
    overlay.appendChild(spinner)

    if (options.text) {
        const label = document.createElement('span')
        label.textContent = options.text
        label.style.color = 'rgb(var(--colors-accent))'
        label.style.fontSize = '0.875rem'
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
