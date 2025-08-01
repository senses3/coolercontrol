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

import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import svgLoader from 'vite-svg-loader'
import loadVersion from 'vite-plugin-package-version'
import legacy from '@vitejs/plugin-legacy'
// https://vitejs.dev/config/

export default defineConfig({
    base: '/',
    plugins: [
        vue(),
        svgLoader(),
        loadVersion(),
        legacy({
            renderLegacyChunks: false,
        }),
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    build: {
        minify: 'esbuild',
        cssMinify: 'esbuild',
        assetsInlineLimit: 10_240_000,
        cssCodeSplit: false,
        chunkSizeWarningLimit: 2_000,
    },
    css: {
        postcss: './postcss.config.js',
        preprocessorOptions: {
            css: {
                extract: true,
            },
            scss: {
                api: 'modern-compiler',
                // This is temporary and lots of changes are happening for CC 2.0
                // silenceDeprecations: ['global-builtin', 'import'],
            },
        },
    },
})
