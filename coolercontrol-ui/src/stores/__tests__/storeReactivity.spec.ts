import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, defineStore, setActivePinia, storeToRefs } from 'pinia'
import { computed, defineComponent, h, nextTick, shallowRef, triggerRef, watchEffect } from 'vue'

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

describe('store reactivity', () => {
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
})
