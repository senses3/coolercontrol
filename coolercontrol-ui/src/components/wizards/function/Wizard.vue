<!--
  SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon'
import { inject, ref, type Ref } from 'vue'
import type { DynamicDialogInstance } from '@/shell/dialog'
import { Function } from '@/models/Profile.ts'
import NewFunction from '@/components/wizards/fan-control/NewFunction.vue'
import Summary from '@/components/wizards/function/Summary.vue'

const dialogRef: Ref<DynamicDialogInstance> = inject('dialogRef')!
const closeDialog = () => {
    dialogRef.value.close()
}

const currentStep: Ref<number> = ref(11)
const newFunction: Ref<Function | undefined> = ref()
</script>

<template>
    <NewFunction
        v-if="currentStep === 11"
        @next-step="(step: number) => (currentStep = step)"
        @new-function="(fun: Function) => (newFunction = fun)"
        @close="closeDialog"
        :function-name="''"
        :new-function="newFunction"
    />
    <Summary
        v-else-if="currentStep === 13"
        @next-step="(step: number) => (currentStep = step)"
        @close="closeDialog"
        :new-function="newFunction ?? Function.createDefault()"
    />
</template>

<style scoped lang="scss"></style>
