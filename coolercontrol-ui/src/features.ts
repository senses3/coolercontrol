// SPDX-FileCopyrightText: 2023 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Build-time feature flags for experimental UI features. Each flag is gated to
// specific branch builds via FEATURE_BRANCHES in vite.config and hidden
// everywhere else (main, release, and builds where the branch is undetectable).

export type FeatureName = 'coolingWizard'

// Injected by vite.config from the git branch at build time.
declare const __FEATURES__: Partial<Record<FeatureName, boolean>>

const injected: Partial<Record<FeatureName, boolean>> =
    typeof __FEATURES__ !== 'undefined' ? __FEATURES__ : {}

export const features: Readonly<Record<FeatureName, boolean>> = Object.freeze({
    coolingWizard: injected.coolingWizard ?? false,
})
