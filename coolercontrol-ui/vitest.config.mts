// SPDX-FileCopyrightText: 2023 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import viteConfig from './vite.config.mjs'

/** @type {import('vite').UserConfig} */
export default mergeConfig(viteConfig, {
    test: {
        watch: false,
        environment: 'jsdom',
        exclude: [...configDefaults.exclude, 'e2e/*'],
        root: fileURLToPath(new URL('./', import.meta.url)),
        transformMode: {
            web: [/\.[jt]sx$/],
        },
    },
})
