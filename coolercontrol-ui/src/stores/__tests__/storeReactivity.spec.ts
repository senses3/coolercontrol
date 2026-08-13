// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, defineStore, setActivePinia, storeToRefs } from 'pinia'
import {
    computed,
    defineComponent,
    h,
    nextTick,
    ref,
    shallowRef,
    triggerRef,
    watch,
    watchEffect,
} from 'vue'

// Locks the contract DeviceStore.currentDeviceStatus depends on: a Map mutated in place
// and published with triggerRef must reach components reading it through storeToRefs.
// The Map identity never changes, so only effects tracking the ref itself see the update.
// Pinia 2.2.5 broke this and forced the downgrade in issue 369. Current Vue handles that
// case on its own, so this is a forward guard for pinia upgrades, not a reproduction.
const useStatusStore = defineStore('test-status', () => {
    const currentDeviceStatus = shallowRef(new Map<string, number>())

    function publish(key: string, value: number): void {
        currentDeviceStatus.value.set(key, value)
        triggerRef(currentDeviceStatus)
    }

    return { currentDeviceStatus, publish }
})

// Locks the contract the settings saver depends on for array-valued settings. Its watch list has
// no deep: true, so a source passed as a ref is only seen when the ref is given a new value. A
// setter that pushed into the existing array instead would change the setting on screen and never
// persist it, which is invisible until a restart.
const usePositionStore = defineStore('test-positions', () => {
    const positions = ref<Array<[string, string]>>([])

    function setReplacing(key: string, value: string): void {
        positions.value = [...positions.value.filter(([k]) => k !== key), [key, value]]
    }

    function setInPlace(key: string, value: string): void {
        positions.value.push([key, value])
    }

    return { positions, setReplacing, setInPlace }
})

// Locks the contract ChannelPage depends on for following a Mode activation. Activating a
// Mode rewrites channel settings in the daemon and the SSE handler reloads every device,
// replacing each channel DTO with a fresh object. A page that seeds its control state once
// at setup keeps showing the old setting until it is remounted.
const useChannelSettingsStore = defineStore('test-channel-settings', () => {
    const allDaemonDeviceSettings = ref(new Map<string, Map<string, { profile_uid?: string }>>())

    // Mirrors loadDaemonDeviceSettings: new DTOs every time, whether or not anything changed.
    function reload(deviceUID: string, channelName: string, profileUID?: string): void {
        const settings = new Map<string, { profile_uid?: string }>()
        settings.set(channelName, { profile_uid: profileUID })
        allDaemonDeviceSettings.value.set(deviceUID, settings)
    }

    return { allDaemonDeviceSettings, reload }
})

describe('store reactivity', () => {
    it('reaches a non-deep watcher only when an array setting is replaced', async () => {
        setActivePinia(createPinia())
        const store = usePositionStore()
        // The store's own ref, as the saver sees it from inside the store setup. Reading
        // store.positions instead hands back the unwrapped array and watches the wrong thing.
        const { positions } = storeToRefs(store)

        let saves = 0
        watch(positions, () => (saves += 1))

        store.setReplacing('profile-1', 'top-left')
        await nextTick()
        expect(saves).toBe(1)

        store.setReplacing('profile-1', 'bottom-right')
        await nextTick()
        expect(saves).toBe(2)

        store.setInPlace('profile-2', 'top-left')
        await nextTick()
        expect(saves).toBe(2)
    })

    it('propagates in-place shallowRef updates through storeToRefs', async () => {
        setActivePinia(createPinia())
        const store = useStatusStore()
        const { currentDeviceStatus } = storeToRefs(store)

        const seen: number[] = []
        watchEffect(() => seen.push(currentDeviceStatus.value.get('fan1') ?? -1))
        const derived = computed(() => currentDeviceStatus.value.get('fan1') ?? -1)

        store.publish('fan1', 50)
        await nextTick()
        expect(derived.value).toBe(50)

        store.publish('fan1', 75)
        await nextTick()
        expect(derived.value).toBe(75)
        expect(seen).toEqual([-1, 50, 75])
    })

    it('re-renders a component reading the store through storeToRefs', async () => {
        setActivePinia(createPinia())
        const store = useStatusStore()

        const Panel = defineComponent({
            setup() {
                const { currentDeviceStatus } = storeToRefs(useStatusStore())
                return () => h('div', String(currentDeviceStatus.value.get('fan1') ?? 'none'))
            },
        })
        const wrapper = mount(Panel)
        expect(wrapper.text()).toBe('none')

        store.publish('fan1', 50)
        await nextTick()
        expect(wrapper.text()).toBe('50')

        store.publish('fan1', 75)
        await nextTick()
        expect(wrapper.text()).toBe('75')
    })

    it('re-seeds channel control state only when the daemon setting really changed', async () => {
        setActivePinia(createPinia())
        const store = useChannelSettingsStore()
        store.reload('dev-1', 'fan1', 'profile-a')

        const daemonSetting = computed(() =>
            store.allDaemonDeviceSettings.get('dev-1')?.get('fan1'),
        )
        const selectedProfileUID = ref(daemonSetting.value?.profile_uid)
        let reseeds = 0
        // Separate getters, not one array getter: the array is a new value on every reload,
        // so `watch(() => [a, b])` would re-seed even when nothing changed and would discard
        // an edit in progress.
        watch([() => daemonSetting.value?.profile_uid], () => {
            reseeds += 1
            selectedProfileUID.value = daemonSetting.value?.profile_uid
        })

        store.reload('dev-1', 'fan1', 'profile-b')
        await nextTick()
        expect(selectedProfileUID.value).toBe('profile-b')
        expect(reseeds).toBe(1)

        store.reload('dev-1', 'fan1', 'profile-b')
        await nextTick()
        expect(reseeds).toBe(1)
    })

    // Locks the ordering LightingView and LcdView rely on when a Mode activation re-seeds
    // them. Their dirty watcher cannot tell a re-seed from a user edit, so it raises the
    // unsaved-changes flag off the re-seed's own writes. Clearing on nextTick lands after
    // that watcher has run; clearing inline would be overwritten and the page would then
    // prompt about changes the user never made.
    it('clears an unsaved-changes flag raised by the re-seed itself', async () => {
        const drained = (): Promise<void> => new Promise((resolve) => setTimeout(resolve))
        const daemonValue = ref('mode-a')
        const selected = ref(daemonValue.value)
        const dirty = ref(false)

        watch(daemonValue, () => {
            selected.value = daemonValue.value
            void nextTick(() => (dirty.value = false))
        })
        watch(selected, () => (dirty.value = true))

        daemonValue.value = 'mode-b'
        await drained()
        expect(selected.value).toBe('mode-b')
        expect(dirty.value).toBe(false)

        // A real edit still marks the page dirty.
        selected.value = 'mode-c'
        await drained()
        expect(dirty.value).toBe(true)
    })
})
