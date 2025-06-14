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
    root: ({ props }) => ({
        class: [
            //Size and Shape
            'w-1/3 rounded-lg',

            // Positioning
            {
                '-translate-x-2/4':
                    props.position === 'top-center' || props.position === 'bottom-center',
            },
        ],
    }),
    message: ({ props }) => ({
        class: [
            'my-4 rounded-lg w-full',
            'border-0 border-l-[6px]',
            // 'backdrop-blur-[10px] shadow-lg',
            'backdrop-blur shadow-lg',

            // Colors
            {
                'bg-info/20': props.message.severity === 'info',
                'bg-success/20': props.message.severity === 'success',
                'bg-warning/20': props.message.severity === 'warn',
                'bg-error/20': props.message.severity === 'error',
            },
            {
                'border-info': props.message.severity === 'info',
                'border-success': props.message.severity === 'success',
                'border-warning': props.message.severity === 'warn',
                'border-error': props.message.severity === 'error',
            },
            {
                'text-text-color':
                    props.message.severity === 'info' || props.message.severity === 'success',
                'text-warning': props.message.severity === 'warn',
                'text-error': props.message.severity === 'error',
            },
        ],
    }),
    messageContent: ({ props }) => ({
        class: [
            'flex p-4',
            {
                'items-start': props.message.summary,
                'items-center': !props.message.summary,
            },
        ],
    }),
    messageIcon: ({ props }) => ({
        class: [
            // Sizing and Spacing
            'w-6 h-6',
            'text-lg leading-none mr-2 shrink-0',

            // Colors
            {
                'text-info': props.message.severity === 'info',
                'text-success': props.message.severity === 'success',
                'text-warning': props.message.severity === 'warn',
                'text-error': props.message.severity === 'error',
            },
        ],
    }),
    messageText: {
        class: [
            // Font and Text
            'text-base leading-none',
            'ml-2',
            'flex-1',
        ],
    },
    summary: {
        class: 'font-bold block',
    },
    detail: ({ props }) => ({
        class: ['block', { 'mt-2': props.message.summary }],
    }),
    closeButton: {
        class: [
            // Flexbox
            'flex items-center justify-center',

            // Size
            'w-8 h-8',

            // Spacing and Misc
            'ml-auto  relative',

            // Shape
            'rounded-full',

            // Colors
            'bg-transparent outline-0',

            // Transitions
            'transition duration-200 ease-in-out',

            // States
            'hover:bg-surface-hover/50',

            // Misc
            'overflow-hidden',
        ],
    },
    transition: {
        enterFromClass: 'opacity-0 translate-y-2/4',
        enterActiveClass: 'transition-[transform,opacity] duration-300',
        leaveFromClass: 'max-h-[1000px]',
        leaveActiveClass:
            '!transition-[max-height_.45s_cubic-bezier(0,1,0,1),opacity_.3s,margin-bottom_.3s] overflow-hidden',
        leaveToClass: 'max-h-0 opacity-0 mb-0',
    },
}
