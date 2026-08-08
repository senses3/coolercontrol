<!--
  SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon'
import { inject, ref, type Ref } from 'vue'
import type { DynamicDialogInstance } from '@/shell/dialog'
import NewMode from '@/components/wizards/mode/NewMode.vue'

const dialogRef: Ref<DynamicDialogInstance> = inject('dialogRef')!
const closeDialog = () => {
    dialogRef.value.close()
}

const currentStep: Ref<number> = ref(1)
</script>

<template>
    <NewMode v-if="currentStep === 1" @close="closeDialog" />
</template>

<style scoped lang="scss"></style>
