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
    root: {
        class: 'relative inline-block',
    },
    previewMask: {
        class: [
            // Flexbox & Alignment
            'flex items-center justify-center',

            // Positioning
            'absolute',

            // Shape
            'inset-0 opacity-0 transition-opacity duration-300',

            // Color
            'bg-transparent text-surface-100',

            // States
            'hover:opacity-100 hover:cursor-pointer hover:bg-black/50 hover:bg-opacity-50',
        ],
    },
    mask: {
        class: [
            // Flexbox & Alignment
            'flex items-center justify-center',

            // Positioning
            'fixed top-0 left-0',

            // Sizing
            'w-full h-full',

            // Color
            'bg-black/90',
        ],
    },
    toolbar: {
        class: [
            // Flexbox
            'flex',

            // Positioning
            'absolute top-0 right-0',

            // Spacing
            'p-4',
        ],
    },
    rotateRightButton: {
        class: [
            'z-20',

            // Flexbox & Alignment
            'flex justify-center items-center',

            // Size
            'w-12 h-12',

            // Spacing
            'mr-2',

            // Shape
            'rounded-full',

            // Color
            'text-white bg-transparent',

            // States
            'hover:text-white hover:bg-surface-0/10',
            'focus:outline-none focus:outline-offset-0 focus:ring focus:ring-primary-400/50 dark:focus:ring-primary-300/50',

            // Transition
            'transition duration-200 ease-in-out',
        ],
    },
    rotateRightIcon: {
        class: 'w-6 h-6',
    },
    rotateLeftButton: {
        class: [
            'z-20',

            // Flexbox & Alignment
            'flex justify-center items-center',

            // Size
            'w-12 h-12',

            // Spacing
            'mr-2',

            // Shape
            'rounded-full',

            // Color
            'text-white bg-transparent',

            // States
            'hover:text-white hover:bg-surface-0/10',
            'focus:outline-none focus:outline-offset-0 focus:ring focus:ring-primary-400/50 dark:focus:ring-primary-300/50',

            // Transition
            'transition duration-200 ease-in-out',
        ],
    },
    rotateLeftIcon: {
        class: 'w-6 h-6',
    },
    zoomOutButton: {
        class: [
            'z-20',

            // Flexbox & Alignment
            'flex justify-center items-center',

            // Size
            'w-12 h-12',

            // Spacing
            'mr-2',

            // Shape
            'rounded-full',

            // Color
            'text-white bg-transparent',

            // States
            'hover:text-white hover:bg-surface-0/10',
            'focus:outline-none focus:outline-offset-0 focus:ring focus:ring-primary-400/50 dark:focus:ring-primary-300/50',

            // Transition
            'transition duration-200 ease-in-out',
        ],
    },
    zoomOutIcon: {
        class: 'w-6 h-6',
    },
    zoomInButton: {
        class: [
            'z-20',

            // Flexbox & Alignment
            'flex justify-center items-center',

            // Size
            'w-12 h-12',

            // Spacing
            'mr-2',

            // Shape
            'rounded-full',

            // Color
            'text-white bg-transparent',

            // States
            'hover:text-white hover:bg-surface-0/10',
            'focus:outline-none focus:outline-offset-0 focus:ring focus:ring-primary-400/50 dark:focus:ring-primary-300/50',

            // Transition
            'transition duration-200 ease-in-out',
        ],
    },
    zoomInIcon: {
        class: 'w-6 h-6',
    },
    closeButton: {
        class: [
            'z-20',

            // Flexbox & Alignment
            'flex justify-center items-center',

            // Size
            'w-12 h-12',

            // Spacing
            'mr-2',

            // Shape
            'rounded-full',

            // Color
            'text-white bg-transparent',

            // States
            'hover:text-white hover:bg-surface-0/10',
            'focus:outline-none focus:outline-offset-0 focus:ring focus:ring-primary-400/50 dark:focus:ring-primary-300/50',

            // Transition
            'transition duration-200 ease-in-out',
        ],
    },
    closeIcon: {
        class: 'w-6 h-6',
    },
    transition: {
        enterFromClass: 'opacity-0 scale-75',
        enterActiveClass: 'transition-all duration-150 ease-in-out',
        leaveActiveClass: 'transition-all duration-150 ease-in',
        leaveToClass: 'opacity-0 scale-75',
    },
}
