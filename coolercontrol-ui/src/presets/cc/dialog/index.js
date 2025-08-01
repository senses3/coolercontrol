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

export default {
    root: ({ state }) => ({
        class: [
            // Shape
            'rounded-lg',
            'shadow-lg',
            'border-0',

            // Size
            'max-h-[90vh]',
            'm-0',

            // Color
            'border-2',
            'border-border-one',

            // Transitions
            'transform',
            'scale-100',

            // Maximized State
            {
                'transition-none': state.maximized,
                'transform-none': state.maximized,
                '!w-screen': state.maximized,
                '!h-screen': state.maximized,
                '!max-h-full': state.maximized,
                '!top-0': state.maximized,
                '!left-0': state.maximized,
            },
        ],
    }),
    header: {
        class: [
            // Flexbox and Alignment
            'flex items-center justify-between',
            'shrink-0',

            // Spacing
            'p-6',

            // Shape
            'border-t-0',
            'rounded-tl-lg',
            'rounded-tr-lg',

            // Colors
            'bg-bg-two',
            'text-text-color',
        ],
    },
    title: {
        class: ['font-bold text-lg'],
    },
    headerActions: {
        class: ['flex items-center'],
    },
    content: ({ state, instance }) => ({
        class: [
            // Spacing
            'px-6',
            'pb-8',
            'pt-0',

            // Shape
            {
                grow: state.maximized,
                'rounded-bl-lg': !instance.$slots.footer,
                'rounded-br-lg': !instance.$slots.footer,
            },

            // Colors
            'bg-bg-two',
            'text-text-color',

            // Misc
            'overflow-y-auto',
        ],
    }),
    footer: {
        class: [
            // Flexbox and Alignment
            'flex items-center justify-end',
            'shrink-0',
            'text-right',
            'gap-2',

            // Spacing
            'px-6',
            'pb-6',

            // Shape
            'border-t-0',
            'rounded-b-lg',

            // Colors
            'bg-bg-two',
            'text-text-color',
        ],
    },
    mask: ({ props }) => ({
        class: [
            // Transitions
            'transition-all',
            'duration-300',
            { 'p-5': !props.position == 'full' },

            // Background and Effects
            {
                'has-[.mask-active]:bg-transparent bg-black/40': props.modal,
                'has-[.mask-active]:backdrop-blur-none backdrop-blur-sm': props.modal,
            },
        ],
    }),
    transition: ({ props }) => {
        return props.position === 'top'
            ? {
                  enterFromClass:
                      'opacity-0 scale-75 translate-x-0 -translate-y-full translate-z-0 mask-active',
                  enterActiveClass: 'transition-all duration-200 ease-out',
                  leaveActiveClass: 'transition-all duration-200 ease-out',
                  leaveToClass:
                      'opacity-0 scale-75 translate-x-0 -translate-y-full translate-z-0 mask-active',
              }
            : props.position === 'bottom'
              ? {
                    enterFromClass: 'opacity-0 scale-75 translate-y-full mask-active',
                    enterActiveClass: 'transition-all duration-200 ease-out',
                    leaveActiveClass: 'transition-all duration-200 ease-out',
                    leaveToClass:
                        'opacity-0 scale-75 translate-x-0 translate-y-full translate-z-0 mask-active',
                }
              : props.position === 'left' ||
                  props.position === 'topleft' ||
                  props.position === 'bottomleft'
                ? {
                      enterFromClass:
                          'opacity-0 scale-75 -translate-x-full translate-y-0 translate-z-0 mask-active',
                      enterActiveClass: 'transition-all duration-200 ease-out',
                      leaveActiveClass: 'transition-all duration-200 ease-out',
                      leaveToClass:
                          'opacity-0 scale-75  -translate-x-full translate-y-0 translate-z-0 mask-active',
                  }
                : props.position === 'right' ||
                    props.position === 'topright' ||
                    props.position === 'bottomright'
                  ? {
                        enterFromClass:
                            'opacity-0 scale-75 translate-x-full translate-y-0 translate-z-0 mask-active',
                        enterActiveClass: 'transition-all duration-200 ease-out',
                        leaveActiveClass: 'transition-all duration-200 ease-out',
                        leaveToClass:
                            'opacity-0 scale-75 translate-x-full translate-y-0 translate-z-0 mask-active',
                    }
                  : {
                        enterFromClass: 'opacity-0 scale-75 mask-active',
                        enterActiveClass: 'transition-all duration-200 ease-out',
                        leaveActiveClass: 'transition-all duration-200 ease-out',
                        leaveToClass: 'opacity-0 scale-75 mask-active',
                    }
    },
}
