<!--
  SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon'
import { inject, ref, type Ref } from 'vue'
import type { DynamicDialogInstance } from '@/shell/dialog'
import ApplyToProfiles from '@/components/wizards/function-apply/ApplyToProfiles.vue'
import { UID } from '@/models/Device.ts'

const dialogRef: Ref<DynamicDialogInstance> = inject('dialogRef')!
const closeDialog = () => {
    dialogRef.value.close()
}

const functionUID: UID = dialogRef.value.data.functionUID

const currentStep: Ref<number> = ref(1)
</script>

<template>
    <apply-to-profiles
        v-if="currentStep === 1"
        :function-u-i-d="functionUID"
        @close="closeDialog"
    />
</template>

<style scoped lang="scss"></style>
