<!--
  SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon'
import { inject, ref, type Ref } from 'vue'
import type { DynamicDialogInstance } from '@/shell/dialog'
import ApplyToFans from '@/components/wizards/profile-apply/ApplyToFans.vue'
import { UID } from '@/models/Device.ts'

const dialogRef: Ref<DynamicDialogInstance> = inject('dialogRef')!
const closeDialog = () => {
    dialogRef.value.close()
}

const profileUID: UID = dialogRef.value.data.profileUID

const currentStep: Ref<number> = ref(1)
</script>

<template>
    <apply-to-fans v-if="currentStep === 1" :profile-u-i-d="profileUID" @close="closeDialog" />
</template>

<style scoped lang="scss"></style>
