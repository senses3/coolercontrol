// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// What the panel makes of the lists the folder module builds. The drag itself
// is not here and cannot be: jsdom has no layout, so sortable never moves
// anything, and a test that faked the move would only assert the fake. What is
// worth pinning is the rest: that a folder renders with its items under it,
// that collapsing hides them, and that creating and abandoning a folder leaves
// the settings exactly as they were.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import { VueDraggable } from 'vue-draggable-plus'
import en from '@/i18n/locales/en.ts'
import type { MenuOrderIds } from '@/models/UISettings.ts'

const menuOrder = ref<MenuOrderIds[]>([])
const libraryFolderNames = ref<Array<[string, string]>>([])
const expandedMenuIds = ref<string[] | undefined>(undefined)

vi.mock('@/stores/SettingsStore.ts', () => ({
    useSettingsStore: () => ({
        get menuOrder() {
            return menuOrder.value
        },
        set menuOrder(value: MenuOrderIds[]) {
            menuOrder.value = value
        },
        get libraryFolderNames() {
            return libraryFolderNames.value
        },
        set libraryFolderNames(value: Array<[string, string]>) {
            libraryFolderNames.value = value
        },
        get expandedMenuIds() {
            return expandedMenuIds.value
        },
        set expandedMenuIds(value: string[] | undefined) {
            expandedMenuIds.value = value
        },
    }),
}))

vi.mock('@/stores/DeviceStore.ts', () => ({
    DEFAULT_NAME_STRING_LENGTH: 40,
    useDeviceStore: () => ({ sanitizeString: (value: string) => value.trim() }),
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

const mountList = async () => {
    const { default: LibraryList } = await import('@/shell/cooling/LibraryList.vue')
    return mount(LibraryList, {
        props: {
            kind: 'profiles' as const,
            label: 'Profiles',
            addTooltip: 'Add Profile',
            icon: 'M0 0',
            routeName: 'profiles',
            paramName: 'profileUID',
            entities: [
                { uid: 'a', name: 'Silent' },
                { uid: 'b', name: 'Loud' },
            ],
        },
        global: {
            plugins: [i18n],
            stubs: { SvgIcon: true, RouterLink: { template: '<a><slot /></a>' } },
            directives: { tooltip: {} },
        },
    })
}

const folderRow = (wrapper: Awaited<ReturnType<typeof mountList>>) => wrapper.get('[aria-expanded]')

beforeEach(() => {
    menuOrder.value = [
        { id: 'profiles', children: ['pf:1', 'b'] },
        { id: 'pf:1', children: ['a'] },
    ]
    libraryFolderNames.value = [['pf:1', 'Quiet']]
    expandedMenuIds.value = ['pf:1']
})

describe('LibraryList', () => {
    it('renders a folder with its items and the loose ones beside it', async () => {
        const wrapper = await mountList()
        expect(folderRow(wrapper).text()).toContain('Quiet')
        expect(wrapper.text()).toContain('Silent')
        expect(wrapper.text()).toContain('Loud')
    })

    it('falls back to the default label for an unnamed folder', async () => {
        libraryFolderNames.value = []
        const wrapper = await mountList()
        expect(folderRow(wrapper).text()).toContain('New Folder')
    })

    // v-show, so the items stay in the DOM for the drag layer: what the user is
    // told is aria-expanded, and what they see is the hidden subtree. The style
    // is asserted rather than isVisible(), which reports a detached mount's
    // hidden subtree as visible.
    it('reports and hides a collapsed folder', async () => {
        const wrapper = await mountList()
        const items = () => wrapper.get('[data-folder-items]').element as HTMLElement
        expect(folderRow(wrapper).attributes('aria-expanded')).toBe('true')
        expect(items().style.display).toBe('')

        await folderRow(wrapper).trigger('click')
        expect(folderRow(wrapper).attributes('aria-expanded')).toBe('false')
        expect(expandedMenuIds.value).toEqual([])
        expect(items().style.display).toBe('none')
    })

    it('adds a folder at the top, expanded and waiting for a name', async () => {
        const wrapper = await mountList()
        await wrapper.get('button').trigger('click')
        await nextTick()

        const rootIds = menuOrder.value.find((entry) => entry.id === 'profiles')!.children
        expect(rootIds).toHaveLength(3)
        expect(rootIds[0]).toMatch(/^pf:/)
        expect(expandedMenuIds.value).toContain(rootIds[0])
        expect(wrapper.find('input').exists()).toBe(true)
    })

    it('names a new folder on enter', async () => {
        const wrapper = await mountList()
        await wrapper.get('button').trigger('click')
        await nextTick()
        const input = wrapper.get('input')
        await input.setValue('  Loud fans  ')
        await input.trigger('keydown.enter')

        const created = menuOrder.value.find((entry) => entry.id === 'profiles')!.children[0]
        expect(libraryFolderNames.value).toContainEqual([created, 'Loud fans'])
    })

    // The button is one keystroke away from an empty row the user then has to
    // find and delete, so an abandoned creation has to leave nothing behind.
    it('discards a new folder abandoned unnamed', async () => {
        const wrapper = await mountList()
        const before = JSON.stringify(menuOrder.value)
        await wrapper.get('button').trigger('click')
        await nextTick()
        await wrapper.get('input').trigger('keydown.esc')

        expect(JSON.stringify(menuOrder.value)).toEqual(before)
        expect(expandedMenuIds.value).toEqual(['pf:1'])
        expect(libraryFolderNames.value).toEqual([['pf:1', 'Quiet']])
    })

    it('keeps an existing folder when its rename is cancelled', async () => {
        const wrapper = await mountList()
        const buttons = wrapper.findAll('button')
        await buttons[buttons.length - 2].trigger('click')
        await nextTick()
        await wrapper.get('input').setValue('Other')
        await wrapper.get('input').trigger('keydown.esc')

        expect(libraryFolderNames.value).toEqual([['pf:1', 'Quiet']])
        expect(folderRow(wrapper).text()).toContain('Quiet')
    })

    // Deleting the folder must not delete what was in it: the items come back
    // to the root list, in the folder's slot.
    it('returns a deleted folder items to the root list', async () => {
        const wrapper = await mountList()
        const buttons = wrapper.findAll('button')
        await buttons[buttons.length - 1].trigger('click')

        expect(menuOrder.value.find((entry) => entry.id === 'profiles')!.children).toEqual([
            'a',
            'b',
        ])
        expect(menuOrder.value.some((entry) => entry.id === 'pf:1')).toBe(false)
        expect(libraryFolderNames.value).toEqual([])
        expect(expandedMenuIds.value).toEqual([])
    })

    it('emits add for the entity button', async () => {
        const wrapper = await mountList()
        await wrapper.findAll('button')[1].trigger('click')
        expect(wrapper.emitted('add')).toHaveLength(1)
    })
})

// The drag cannot be performed in jsdom, but the handlers sortable would call
// are ordinary functions, so they are called here with the events sortable
// passes. That tests the logic without pretending an item moved.
describe('LibraryList drag handlers', () => {
    const draggables = async () => {
        const wrapper = await mountList()
        const lists = wrapper.findAllComponents(VueDraggable)
        return { wrapper, root: lists[0], folder: lists[1] }
    }
    const element = (folderId?: string): HTMLElement => {
        const el = document.createElement('div')
        if (folderId != null) el.dataset.folder = folderId
        return el
    }

    it('keeps profiles and functions in separate drag groups', async () => {
        const { root, folder } = await draggables()
        expect((root.props('group') as { name: string }).name).toBe('profiles')
        expect((folder.props('group') as { name: string }).name).toBe('profiles')
    })

    // Flat: the put predicate is the only thing standing between a folder and
    // being dropped inside another one.
    it('refuses a folder dropped into a folder', async () => {
        const { folder } = await draggables()
        const put = (folder.props('group') as { put: Function }).put
        expect(put(null, null, element('pf:2'))).toBe(false)
        expect(put(null, null, element())).toBe(true)
    })

    it('opens a collapsed folder the drag passes over', async () => {
        expandedMenuIds.value = []
        const { root } = await draggables()
        const onMove = root.props('onMove') as Function

        expect(onMove({ related: element('pf:1') })).toBe(true)
        expect(expandedMenuIds.value).toEqual(['pf:1'])
    })

    it('closes what the drag opened, except where the item landed', async () => {
        expandedMenuIds.value = []
        const { root } = await draggables()
        const onMove = root.props('onMove') as Function
        const onEnd = root.props('onEnd') as Function
        onMove({ related: element('pf:1') })
        onMove({ related: element('pf:2') })
        expect(expandedMenuIds.value).toEqual(['pf:1', 'pf:2'])

        const landed = document.createElement('div')
        landed.dataset.folderItems = 'pf:2'
        onEnd({ to: landed })
        expect(expandedMenuIds.value).toEqual(['pf:2'])
    })

    it('closes every folder the drag opened when the item lands outside one', async () => {
        expandedMenuIds.value = []
        const { root } = await draggables()
        ;(root.props('onMove') as Function)({ related: element('pf:1') })
        ;(root.props('onEnd') as Function)({ to: document.createElement('div') })
        expect(expandedMenuIds.value).toEqual([])
    })

    // A folder the user opened themselves is not the drag's to close: only
    // what the drag itself opened is taken back.
    it('leaves a folder the user opened alone', async () => {
        const { root } = await draggables()
        ;(root.props('onMove') as Function)({ related: element('pf:1') })
        ;(root.props('onEnd') as Function)({ to: document.createElement('div') })
        expect(expandedMenuIds.value).toEqual(['pf:1'])
    })
})
