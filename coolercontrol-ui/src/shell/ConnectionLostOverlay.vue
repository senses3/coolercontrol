<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useDaemonState } from '@/stores/DaemonState.ts'
import { svgLoader, svgLoaderViewBox } from '@/models/Loader.ts'

const { t } = useI18n()
const daemonState = useDaemonState()
</script>

<template>
    <Teleport to="body">
        <!-- Opaque rather than a scrim: the readings underneath are stale, and
             leaving them visible is what made an outage hard to notice. -->
        <div
            v-if="daemonState.connectionLost"
            role="alert"
            aria-live="assertive"
            class="fixed inset-0 z-[1500] flex flex-col items-center justify-center gap-3 bg-bg-one px-6 text-center text-text-color"
        >
            <!-- static compile-time constant, never user input -->
            <svg
                :viewBox="svgLoaderViewBox.replaceAll(',', ' ')"
                class="h-16 w-16"
                v-html="svgLoader"
            />
            <h2 class="text-2xl">{{ t('views.daemon.daemonDisconnected') }}</h2>
            <p class="text-lg text-accent">{{ t('views.daemon.reconnecting') }}</p>
            <p class="text-base text-text-color-secondary">
                {{ t('views.daemon.disconnectedFor', { time: daemonState.disconnectedFor }) }}
            </p>
            <p class="max-w-md text-sm text-text-color-secondary">
                {{ t('views.daemon.daemonDisconnectedDetail') }}
            </p>
        </div>
    </Teleport>
</template>
