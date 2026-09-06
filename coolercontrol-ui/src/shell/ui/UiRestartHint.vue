<!--
  SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// Marker next to a control whose change only takes effect after a daemon
// restart. Sits beside the control like UiLockToggle, warning-colored.
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiRestart } from '@mdi/js'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
    <span
        class="inline-flex h-10 w-8 shrink-0 items-center justify-center text-warning"
        role="img"
        :aria-label="t('layout.settings.tooltips.triggersDaemonRestart')"
        v-tooltip.top="t('layout.settings.tooltips.triggersDaemonRestart')"
    >
        <svg-icon type="mdi" :path="mdiRestart" :size="16" />
    </span>
</template>
