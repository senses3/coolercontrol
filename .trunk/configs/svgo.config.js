// SPDX-FileCopyrightText: 2024 Guy Boldon and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

module.exports = {
    plugins: [
        {
            name: 'preset-default',
            params: {
                overrides: {
                    removeViewBox: false, // https://github.com/svg/svgo/issues/1128
                    sortAttrs: true,
                    removeOffCanvasPaths: true,
                },
            },
        },
    ],
}
