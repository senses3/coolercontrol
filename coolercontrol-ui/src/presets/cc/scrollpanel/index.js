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
    contentContainer: {
        class: [
            // Size & Position
            'h-full w-full',

            // Layering
            'z-[1]',

            // Spacing
            'overflow-hidden',

            // Misc
            'relative float-left',
        ],
    },
    content: {
        class: [
            // Size & Spacing
            'h-[calc(100%+18px)] w-[calc(100%+18px)] pr-[18px] pb-[18px] pl-0 pt-0',

            // Overflow & Scrollbar
            'overflow-scroll scrollbar-none',

            // Box Model
            'box-border',

            // Position
            'relative',

            // Webkit Specific
            '[&::-webkit-scrollbar]:hidden',
        ],
    },
    barX: {
        class: [
            // Size & Position
            'h-[9px] bottom-0',

            // Appearance
            'bg-surface-50 dark:bg-surface-700 rounded',

            // Interactivity
            'cursor-pointer',

            // Visibility & Layering
            'invisible z-20',

            // Transition
            'transition duration-[250ms] ease-linear',

            // Misc
            'relative',
        ],
    },
    barY: {
        class: [
            // Size & Position
            'w-[9px] top-0',

            // Appearance
            'bg-surface-50 dark:bg-surface-700 rounded',

            // Interactivity
            'cursor-pointer',

            // Visibility & Layering
            'z-20',

            // Transition
            'transition duration-[250ms] ease-linear',

            // Misc
            'relative',
        ],
    },
}
