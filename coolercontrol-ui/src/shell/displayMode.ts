// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Whether the browser is drawing its own chrome around the app. Kept out of
// DeviceStore because this is a browser-platform question, not a daemon one.

import { readonly, ref } from 'vue'

// Matched rather than the standalone/minimal-ui union on purpose: F11 in an
// ordinary tab also hides the browser's back button, and an in-app one belongs
// there too.
const browserChromeQuery = window.matchMedia('(display-mode: browser)')

const browserChrome = ref(browserChromeQuery.matches)

// A live document does change mode: Chromium's "Open in Chrome" moves an installed
// window's tab into a browser window without reloading it.
browserChromeQuery.addEventListener('change', (event) => {
    browserChrome.value = event.matches
})

/** True when the browser's own back button is on screen. */
export const hasBrowserChrome = readonly(browserChrome)
