<!--
  SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// Host for kit dynamic dialogs (shell/dialog.ts). One item per open dialog so
// each can provide its own dialogRef; stacking is supported.
import { openDialogs } from '@/shell/dialog'
import UiDialogHostItem from '@/shell/ui/UiDialogHostItem.vue'
</script>

<template>
    <UiDialogHostItem v-for="dialog in openDialogs" :key="dialog.id" :dialog="dialog" />
</template>
