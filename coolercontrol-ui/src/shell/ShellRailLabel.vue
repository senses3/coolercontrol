<!--
  SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
  SPDX-License-Identifier: GPL-3.0-or-later
-->

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

// Rail labels stay on one line and clip with an ellipsis when a translation
// outgrows the rail. Whether that happened is reported upward, because the
// tooltip that recovers the full word belongs on the whole rail item: hosting
// it here would only answer a pointer that is over the text itself.
const props = defineProps<{
    label: string
    // Anything that changes the text metrics without changing the label, which
    // in practice is the interface-font setting swapping the family.
    fontKey: string
}>()
const emit = defineEmits<{ 'update:truncated': [truncated: boolean] }>()

const labelEl = ref<HTMLElement>()

const measure = (): void => {
    const el = labelEl.value
    if (el == null) return
    emit('update:truncated', el.scrollWidth > el.clientWidth)
}

// The bundled font can land after the fallback has already been measured, and
// font-display: swap re-lays-out the label when it does.
onMounted(() => {
    measure()
    void document.fonts?.ready.then(measure)
})
watch([() => props.label, () => props.fontKey], () => nextTick(measure))
</script>

<template>
    <span ref="labelEl" class="block w-full truncate text-center text-[0.75rem] leading-tight">
        {{ label }}
    </span>
</template>
