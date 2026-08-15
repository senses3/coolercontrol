// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// The channel pages hand their embedded profile editor back to
// useChannelControl through a template ref, which is how Apply knows the editor
// has unsaved changes. Binding that with `:ref="someRef"` silently does
// nothing, and the failure is invisible: no error, no type error, just an Apply
// button that never lights up. Both halves of that are pinned here.

import { describe, expect, it } from 'vitest'
import { parse, compileScript } from '@vue/compiler-sfc'
import { mount } from '@vue/test-utils'
import { computed, defineComponent, h, nextTick, ref } from 'vue'

const vueSources = import.meta.glob('../../**/*.vue', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>

const compileTemplate = (binding: string): string => {
    const source = [
        '<script setup>',
        'const editorRef = ref()',
        'const setEditorRef = () => {}',
        '</script>',
        '<template>',
        `<Child ${binding} />`,
        '</template>',
    ].join('\n')
    const { descriptor } = parse(source)
    return compileScript(descriptor, { id: 'test', inlineTemplate: true }).content
}

describe('template ref binding', () => {
    // `_unref` is the whole problem: the binding receives the ref's value,
    // which is undefined until something sets it, and nothing ever does.
    it('passes the value, not the ref, when a ref is bound directly', () => {
        expect(compileTemplate(':ref="editorRef"')).toContain('ref: _unref(editorRef)')
    })

    // The compiled form above is why: only a function survives the unwrap, so
    // every dynamic binding in the app has to be one.
    it('binds every dynamic template ref to a function', () => {
        const offences: string[] = []
        let found = 0
        for (const [path, source] of Object.entries(vueSources)) {
            for (const match of source.matchAll(/:ref="([^"]*)"/g)) {
                found += 1
                const expression = match[1].trim()
                if (!expression.includes('=>') && !/^set[A-Z]/.test(expression)) {
                    offences.push(`${path}: ${expression}`)
                }
            }
        }
        expect(found).toBeGreaterThan(0)
        expect(offences).toEqual([])
    })

    it('populates the ref when a setter function is bound', async () => {
        const editorRef = ref()
        const editorDirty = computed<boolean>(() => editorRef.value?.contextIsDirty === true)
        const setEditorRef = (instance: unknown): void => {
            editorRef.value = instance
        }

        const Editor = defineComponent({
            setup(_, { expose }) {
                const contextIsDirty = ref(false)
                expose({ contextIsDirty, edit: () => (contextIsDirty.value = true) })
                return () => h('div')
            },
        })
        const Page = defineComponent({ setup: () => () => h(Editor, { ref: setEditorRef }) })

        const wrapper = mount(Page)
        await nextTick()
        expect(editorRef.value, 'the editor never reached the page').not.toBeNull()
        expect(editorDirty.value).toBe(false)

        editorRef.value.edit()
        await nextTick()
        expect(editorDirty.value, 'the page stayed blind to the editor').toBe(true)
        wrapper.unmount()
    })
})
