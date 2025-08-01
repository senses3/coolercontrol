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
    root: ({ context }) => ({
        class: [
            'flex items-center justify-between font-bold leading-none p-5 border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-surface-600 dark:text-surface-0/80 transition duration-200 ease-in-out',
            {
                'focus-visible:outline-none focus-visible:border-primary-500 dark:focus-visible:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-400/20 dark:focus-visible:ring-primary-300/20':
                    !context.disabled,
            },
        ],
    }),
    toggleIcon: 'text-surface-600 dark:text-surface-0/80',
}
