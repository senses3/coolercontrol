// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// The Library folders as picker option groups. Every picker wants the same
// store state and the same untitled-folder label, so only the entities differ.

import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import type { UiOptionGroup } from '@/shell/ui/UiGroupedListbox.vue'
import {
    libraryOptionGroups,
    withLeadingOption,
    type LibraryEntity,
} from '@/shell/libraryOptions.ts'
import type { LibraryKind } from '@/shell/libraryFolders.ts'

const DEFAULT_UID = '0'

export function useLibraryGroups() {
    const { t } = useI18n()
    const settingsStore = useSettingsStore()

    const groupsOf = (kind: LibraryKind, entities: LibraryEntity[]): UiOptionGroup[] =>
        libraryOptionGroups(
            settingsStore.menuOrder,
            kind,
            entities,
            settingsStore.libraryFolderNames,
            t('layout.shell.coolingPanel.newFolder'),
        )

    return {
        profileGroups: (
            entities: MaybeRefOrGetter<LibraryEntity[]>,
        ): ComputedRef<UiOptionGroup[]> => computed(() => groupsOf('profiles', toValue(entities))),

        // Pass the full list: the default function is never filed in a folder,
        // and belongs first.
        functionGroups: (
            entities: MaybeRefOrGetter<LibraryEntity[]>,
        ): ComputedRef<UiOptionGroup[]> =>
            computed(() => {
                const all = toValue(entities)
                const fallback = all.find((entity) => entity.uid === DEFAULT_UID)
                return withLeadingOption(
                    groupsOf(
                        'functions',
                        all.filter((entity) => entity.uid !== DEFAULT_UID),
                    ),
                    fallback == null ? undefined : { label: fallback.name, value: fallback.uid },
                )
            }),
    }
}
