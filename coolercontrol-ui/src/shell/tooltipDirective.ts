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

import type { Directive, DirectiveBinding } from 'vue'

// App-wide v-tooltip directive (PrimeVue-compatible API subset: .top/.bottom/
// .left/.right modifiers; value as string or { value, escape, disabled }).
// One shared tooltip element; component re-renders only refresh its content
// in place, so live-updating pages no longer close an open tooltip.

type Position = 'top' | 'bottom' | 'left' | 'right'

interface TooltipOptions {
    value: string
    escape: boolean
    disabled: boolean
    position: Position
}

interface TooltipHost extends Element {
    $ccTooltip?: TooltipOptions
    $ccTooltipShow?: () => void
    $ccTooltipShowDelayed?: () => void
    $ccTooltipHide?: () => void
}

let tooltipEl: HTMLDivElement | undefined
let currentHost: TooltipHost | undefined

// Hover has a short show-delay (a middle ground between instant and the browser's
// long native delay). Keyboard focus shows immediately for accessibility.
const SHOW_DELAY_MS = 500
let showTimer: ReturnType<typeof setTimeout> | undefined
let pendingHost: TooltipHost | undefined

const scheduleShow = (host: TooltipHost): void => {
    if (showTimer != null) clearTimeout(showTimer)
    pendingHost = host
    showTimer = setTimeout(() => {
        showTimer = undefined
        pendingHost = undefined
        show(host)
    }, SHOW_DELAY_MS)
}

const cancelShow = (host: TooltipHost): void => {
    if (host !== pendingHost) return
    if (showTimer != null) clearTimeout(showTimer)
    showTimer = undefined
    pendingHost = undefined
}

const ensureTooltipEl = (): HTMLDivElement => {
    if (tooltipEl != null) return tooltipEl
    tooltipEl = document.createElement('div')
    tooltipEl.className =
        'fixed z-[1500] hidden pointer-events-none max-w-80 whitespace-pre-line rounded-lg ' +
        'border border-border-one bg-bg-two px-2.5 py-1.5 text-sm text-text-color shadow-overlay'
    document.body.appendChild(tooltipEl)
    const hideOnViewportChange = () => hide()
    window.addEventListener('scroll', hideOnViewportChange, { capture: true, passive: true })
    window.addEventListener('resize', hideOnViewportChange, { passive: true })
    return tooltipEl
}

const parseOptions = (binding: DirectiveBinding): TooltipOptions => {
    const position: Position = binding.modifiers.bottom
        ? 'bottom'
        : binding.modifiers.left
          ? 'left'
          : binding.modifiers.right
            ? 'right'
            : 'top'
    if (typeof binding.value === 'object' && binding.value != null) {
        return {
            value: binding.value.value ?? '',
            escape: binding.value.escape !== false,
            disabled: binding.value.disabled === true,
            position,
        }
    }
    return { value: binding.value ?? '', escape: true, disabled: false, position }
}

const setContent = (options: TooltipOptions): void => {
    const el = ensureTooltipEl()
    if (options.escape) {
        el.textContent = options.value
    } else {
        // escape: false is reserved for our own i18n strings with inline
        // markup; never route user-derived text through it.
        el.innerHTML = options.value
    }
}

const place = (host: TooltipHost, position: Position): void => {
    const el = ensureTooltipEl()
    const target = host.getBoundingClientRect()
    const tip = el.getBoundingClientRect()
    const offset = 6
    let top: number
    let left: number
    switch (position) {
        case 'bottom':
            top = target.bottom + offset
            left = target.left + target.width / 2 - tip.width / 2
            break
        case 'left':
            top = target.top + target.height / 2 - tip.height / 2
            left = target.left - tip.width - offset
            break
        case 'right':
            top = target.top + target.height / 2 - tip.height / 2
            left = target.right + offset
            break
        default:
            top = target.top - tip.height - offset
            left = target.left + target.width / 2 - tip.width / 2
    }
    const margin = 8
    left = Math.min(Math.max(left, margin), window.innerWidth - tip.width - margin)
    top = Math.min(Math.max(top, margin), window.innerHeight - tip.height - margin)
    el.style.top = `${top}px`
    el.style.left = `${left}px`
}

const show = (host: TooltipHost): void => {
    const options = host.$ccTooltip
    if (options == null || options.disabled || options.value === '') return
    const el = ensureTooltipEl()
    currentHost = host
    setContent(options)
    el.classList.remove('hidden')
    place(host, options.position)
}

const hide = (host?: TooltipHost): void => {
    if (host != null && host !== currentHost) return
    currentHost = undefined
    tooltipEl?.classList.add('hidden')
}

export const tooltipDirective: Directive<
    TooltipHost,
    string | { value?: string; escape?: boolean; disabled?: boolean } | undefined
> = {
    mounted(host, binding) {
        host.$ccTooltip = parseOptions(binding)
        host.$ccTooltipShow = () => show(host)
        host.$ccTooltipShowDelayed = () => scheduleShow(host)
        host.$ccTooltipHide = () => {
            cancelShow(host)
            hide(host)
        }
        host.addEventListener('mouseenter', host.$ccTooltipShowDelayed)
        host.addEventListener('mouseleave', host.$ccTooltipHide)
        host.addEventListener('focusin', host.$ccTooltipShow)
        host.addEventListener('focusout', host.$ccTooltipHide)
    },
    updated(host, binding) {
        const options = parseOptions(binding)
        host.$ccTooltip = options
        if (host !== currentHost) return
        // Refresh an open tooltip in place instead of tearing it down.
        if (options.disabled || options.value === '') {
            hide(host)
            return
        }
        setContent(options)
        place(host, options.position)
    },
    unmounted(host) {
        cancelShow(host)
        hide(host)
        if (host.$ccTooltipShowDelayed != null) {
            host.removeEventListener('mouseenter', host.$ccTooltipShowDelayed)
        }
        if (host.$ccTooltipShow != null) {
            host.removeEventListener('focusin', host.$ccTooltipShow)
        }
        if (host.$ccTooltipHide != null) {
            host.removeEventListener('mouseleave', host.$ccTooltipHide)
            host.removeEventListener('focusout', host.$ccTooltipHide)
        }
    },
}
