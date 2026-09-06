// SPDX-FileCopyrightText: 2022 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { ref } from 'vue'

// Module-level (session-only) so the control-flow tree's open state survives
// navigating away to edit a tree item and back to the channel page.
export const controlFlowExpanded = ref(false)
