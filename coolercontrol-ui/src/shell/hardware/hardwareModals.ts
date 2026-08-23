// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Open state for the two hardware modals, hoisted out of HomePage so the search
// palette can raise them from anywhere. ShellLayout renders both, since it is
// always mounted; HomePage's buttons set the same refs.

import { ref } from 'vue'

export const detectionOpen = ref(false)
export const hardwareReportOpen = ref(false)
