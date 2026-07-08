<!--
  - CoolerControl - monitor and control your cooling and other devices
  - Copyright (c) 2021-2025  Guy Boldon and contributors
  -
  - This program is free software: you can redistribute it and/or modify
  - it under the terms of the GNU General Public License as published by
  - the Free Software Foundation, either version 3 of the License, or
  - (at your option) any later version.
  -
  - This program is distributed in the hope that it will be useful,
  - but WITHOUT ANY WARRANTY; without even the implied warranty of
  - MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  - GNU General Public License for more details.
  -
  - You should have received a copy of the GNU General Public License
  - along with this program.  If not, see <https://www.gnu.org/licenses/>.
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
