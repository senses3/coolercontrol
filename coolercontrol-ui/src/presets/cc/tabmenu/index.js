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
        class: 'overflow-x-auto',
    },
    menu: {
        class: [
            // Flexbox
            'flex flex-1',

            // Spacing
            'list-none',
            'p-0 m-0',

            // Colors
            'bg-surface-0',
            'border-b-2 border-border-one',
            'text-text-color',
        ],
    },
    menuitem: {
        class: 'mr-0',
    },
    action: ({ context, state }) => ({
        class: [
            'relative',

            // Font
            'font-bold',

            // Flexbox and Alignment
            'flex items-center',

            // Spacing
            'p-5',
            '-mb-[2px]',

            // Shape
            'border-b-2',
            'rounded-t-md',

            // Colors and Conditions
            {
                'border-surface-200 dark:border-surface-700': state.d_activeIndex !== context.index,
                // 'bg-surface-0 dark:bg-surface-800': state.d_activeIndex !== context.index,
                'text-surface-700 dark:text-surface-0/80': state.d_activeIndex !== context.index,

                // 'bg-surface-0 dark:bg-surface-800': state.d_activeIndex === context.index,
                'border-primary': state.d_activeIndex === context.index,
                'text-primary': state.d_activeIndex === context.index,
            },

            // States
            'focus-visible:outline-none focus-visible:outline-offset-0 focus-visible:ring focus-visible:ring-inset',
            'focus-visible:ring-primary-400/50 dark:focus-visible:ring-primary-300/50',
            {
                'hover:bg-surface-0 dark:hover:bg-surface-800/80':
                    state.d_activeIndex !== context.index,
                'hover:border-surface-400 dark:hover:border-primary-400':
                    state.d_activeIndex !== context.index,
                'hover:text-surface-900 dark:hover:text-surface-0':
                    state.d_activeIndex !== context.index,
            },

            // Transitions
            'transition-all duration-200',

            // Misc
            'cursor-pointer select-none text-decoration-none',
            'overflow-hidden',
            'user-select-none',
        ],
    }),
    icon: {
        class: 'mr-2',
    },
}
