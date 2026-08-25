// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// The channel control state the channel page runs on. The real stores need a
// component setup (they call useI18n/inject), so the composable is driven
// against stand-ins with the same shapes.

import 'reflect-metadata'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { nextTick, ref, shallowRef, triggerRef } from 'vue'
import { DaemonDeviceSettings, DeviceSettingReadDTO } from '@/models/DaemonSettings.ts'
import { ChannelInfo } from '@/models/ChannelInfo.ts'
import { Device, DeviceType } from '@/models/Device.ts'
import { DeviceInfo } from '@/models/DeviceInfo.ts'
import { SpeedOptions } from '@/models/SpeedOptions.ts'
import { DeviceUISettings, SensorAndChannelSettings } from '@/models/UISettings.ts'

const DEVICE = 'dev-1'
const CHANNEL = 'fan1'

const savedManual: Array<{ deviceUID: string; channelName: string; duty: number }> = []
const savedProfile: Array<{ deviceUID: string; channelName: string; profileUID: string }> = []

const useFakeDeviceStore = defineStore('fake-devices', () => {
    const currentDeviceStatus = shallowRef(new Map<string, Map<string, { duty?: string }>>())
    const setDuty = (duty: string): void => {
        currentDeviceStatus.value.set(DEVICE, new Map([[CHANNEL, { duty }]]))
        triggerRef(currentDeviceStatus)
    }
    const info = new DeviceInfo()
    info.channels.set(CHANNEL, new ChannelInfo(undefined, new SpeedOptions(0, 100, true)))
    const device = new Device(DEVICE, DEVICE, DeviceType.HWMON, 1, undefined, info)
    const allDevices = (): Array<Device> => [device]
    return { currentDeviceStatus, setDuty, allDevices }
})

const useFakeSettingsStore = defineStore('fake-settings', () => {
    const allDaemonDeviceSettings = ref(new Map<string, DaemonDeviceSettings>())
    const deviceUISettings = new DeviceUISettings()
    deviceUISettings.sensorsAndChannels.set(CHANNEL, new SensorAndChannelSettings())
    const allUIDeviceSettings = ref(new Map([[DEVICE, deviceUISettings]]))
    const profiles = ref<Array<{ uid: string; name: string }>>([])

    // Mirrors loadDaemonDeviceSettings: fresh DTOs on every reload, changed or not.
    const reload = (channels: Array<[string, DeviceSettingReadDTO]>): void => {
        const settings = new DaemonDeviceSettings()
        for (const [name, dto] of channels) settings.settings.set(name, dto)
        allDaemonDeviceSettings.value.set(DEVICE, settings)
    }
    const defaultChannelLabel = (): string => CHANNEL
    const saveChannelName = async (): Promise<boolean> => true
    const saveDaemonDeviceSettingManual = async (
        deviceUID: string,
        channelName: string,
        dto: { speed_fixed: number },
    ): Promise<void> => {
        savedManual.push({ deviceUID, channelName, duty: dto.speed_fixed })
    }
    const saveDaemonDeviceSettingProfile = async (
        deviceUID: string,
        channelName: string,
        dto: { profile_uid: string },
    ): Promise<void> => {
        savedProfile.push({ deviceUID, channelName, profileUID: dto.profile_uid })
    }
    return {
        allDaemonDeviceSettings,
        allUIDeviceSettings,
        profiles,
        reload,
        defaultChannelLabel,
        saveChannelName,
        saveDaemonDeviceSettingManual,
        saveDaemonDeviceSettingProfile,
    }
})

vi.mock('@/stores/DeviceStore.ts', () => ({ useDeviceStore: () => useFakeDeviceStore() }))
vi.mock('@/stores/SettingsStore.ts', () => ({ useSettingsStore: () => useFakeSettingsStore() }))

const { useChannelControl } = await import('@/shell/cooling/useChannelControl.ts')

const reading = (values: { speed_fixed?: number; profile_uid?: string }): DeviceSettingReadDTO => {
    const dto = new DeviceSettingReadDTO()
    dto.channel_name = CHANNEL
    dto.speed_fixed = values.speed_fixed
    dto.profile_uid = values.profile_uid
    return dto
}

describe('channel control', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        savedManual.length = 0
        savedProfile.length = 0
    })

    it('reads the control mode the daemon has the channel in', () => {
        const settings = useFakeSettingsStore()
        settings.reload([[CHANNEL, reading({ profile_uid: 'profile-a' })]])
        expect(useChannelControl(DEVICE, CHANNEL).controlMode.value).toBe('automatic')

        settings.reload([[CHANNEL, reading({ speed_fixed: 40 })]])
        const manual = useChannelControl(DEVICE, CHANNEL)
        expect(manual.controlMode.value).toBe('manual')
        expect(manual.manualDuty.value).toBe(40)

        // The default profile is the daemon's spelling of unmanaged.
        settings.reload([[CHANNEL, reading({ profile_uid: '0' })]])
        const unmanaged = useChannelControl(DEVICE, CHANNEL)
        expect(unmanaged.controlMode.value).toBe('unmanaged')
        expect(unmanaged.selectedProfileUID.value).toBeUndefined()
    })

    it('seeds the manual duty from the live duty when the daemon has none', () => {
        useFakeDeviceStore().setDuty('63')
        useFakeSettingsStore().reload([[CHANNEL, reading({ profile_uid: '0' })]])
        expect(useChannelControl(DEVICE, CHANNEL).manualDuty.value).toBe(63)
    })

    // Activating a Mode rewrites the setting under a page that stays mounted.
    it('follows the daemon when the setting really changes, and only then', async () => {
        const settings = useFakeSettingsStore()
        settings.reload([[CHANNEL, reading({ profile_uid: 'profile-a' })]])
        const control = useChannelControl(DEVICE, CHANNEL)

        settings.reload([[CHANNEL, reading({ profile_uid: 'profile-b' })]])
        await nextTick()
        expect(control.selectedProfileUID.value).toBe('profile-b')

        // A reload that changed nothing must not discard an edit in progress.
        control.selectedProfileUID.value = 'profile-c'
        settings.reload([[CHANNEL, reading({ profile_uid: 'profile-b' })]])
        await nextTick()
        expect(control.selectedProfileUID.value).toBe('profile-c')
    })

    it('lists the other channels the assigned profile drives', () => {
        const settings = useFakeSettingsStore()
        const shared = new DaemonDeviceSettings()
        shared.settings.set(CHANNEL, reading({ profile_uid: 'profile-a' }))
        shared.settings.set('fan2', reading({ profile_uid: 'profile-a' }))
        shared.settings.set('fan3', reading({ profile_uid: 'profile-b' }))
        settings.allDaemonDeviceSettings.set(DEVICE, shared)

        const control = useChannelControl(DEVICE, CHANNEL)
        expect(control.sharedChannels.value).toEqual([{ deviceUID: DEVICE, channelName: 'fan2' }])
    })

    it('applies nothing until something differs from the daemon', async () => {
        const settings = useFakeSettingsStore()
        settings.reload([[CHANNEL, reading({ speed_fixed: 40 })]])
        const control = useChannelControl(DEVICE, CHANNEL)
        expect(control.canApply.value).toBe(false)

        control.manualDuty.value = 55
        expect(control.canApply.value).toBe(true)

        // Curve mode with nothing assigned yet has nothing to write.
        control.controlMode.value = 'automatic'
        control.selectedProfileUID.value = undefined
        expect(control.canApply.value).toBe(false)

        // An edit in the embedded editor is enough on its own.
        control.selectedProfileUID.value = 'profile-a'
        settings.reload([[CHANNEL, reading({ profile_uid: 'profile-a' })]])
        await nextTick()
        expect(control.canApply.value).toBe(false)
        control.editorRef.value = { contextIsDirty: true }
        expect(control.canApply.value).toBe(true)
    })

    it('offers no apply on a channel that cannot be controlled', () => {
        useFakeSettingsStore().reload([['fan9', reading({ speed_fixed: 40 })]])
        const control = useChannelControl(DEVICE, 'fan9')
        expect(control.controllable.value).toBe(false)
        expect(control.canApply.value).toBe(false)
    })

    it('writes the manual duty, the default profile, or the assignment', async () => {
        const settings = useFakeSettingsStore()
        settings.reload([[CHANNEL, reading({ speed_fixed: 40 })]])
        const control = useChannelControl(DEVICE, CHANNEL)

        control.manualDuty.value = 55
        await control.apply()
        expect(savedManual).toEqual([{ deviceUID: DEVICE, channelName: CHANNEL, duty: 55 }])

        control.controlMode.value = 'unmanaged'
        await control.apply()
        expect(savedProfile).toEqual([{ deviceUID: DEVICE, channelName: CHANNEL, profileUID: '0' }])

        control.controlMode.value = 'automatic'
        control.selectedProfileUID.value = 'profile-a'
        await control.apply()
        expect(savedProfile[1]).toEqual({
            deviceUID: DEVICE,
            channelName: CHANNEL,
            profileUID: 'profile-a',
        })
    })

    // A fixed speed and an unmanaged channel carry no profile in the daemon's
    // setting, so the channel's own UI settings are the only record of what it
    // last ran.
    it('remembers the profile the daemon has driving the channel', async () => {
        const settings = useFakeSettingsStore()
        settings.reload([[CHANNEL, reading({ profile_uid: 'profile-a' })]])
        const control = useChannelControl(DEVICE, CHANNEL)
        const uiSetting = () =>
            settings.allUIDeviceSettings.get(DEVICE)?.sensorsAndChannels.get(CHANNEL)

        // Recorded up front, or the switch that drops it would be the first
        // thing seen and there would be nothing left to remember.
        expect(uiSetting()?.lastProfileUID).toBe('profile-a')

        settings.reload([[CHANNEL, reading({ speed_fixed: 40 })]])
        await nextTick()
        expect(control.controlMode.value).toBe('manual')
        expect(uiSetting()?.lastProfileUID).toBe('profile-a')

        settings.reload([[CHANNEL, reading({ profile_uid: 'profile-b' })]])
        await nextTick()
        expect(uiSetting()?.lastProfileUID).toBe('profile-b')
    })

    it('offers the remembered profile back when the channel returns to one', async () => {
        const settings = useFakeSettingsStore()
        settings.profiles.push({ uid: 'profile-a', name: 'Quiet' })
        settings.reload([[CHANNEL, reading({ profile_uid: 'profile-a' })]])
        const control = useChannelControl(DEVICE, CHANNEL)

        settings.reload([[CHANNEL, reading({ speed_fixed: 40 })]])
        await nextTick()
        expect(control.selectedProfileUID.value).toBeUndefined()

        control.controlMode.value = 'automatic'
        await nextTick()
        expect(control.selectedProfileUID.value).toBe('profile-a')
    })

    it('offers nothing back when the remembered profile is gone', async () => {
        const settings = useFakeSettingsStore()
        settings.reload([[CHANNEL, reading({ profile_uid: 'profile-a' })]])
        const control = useChannelControl(DEVICE, CHANNEL)
        settings.reload([[CHANNEL, reading({ speed_fixed: 40 })]])
        await nextTick()

        // profiles never held profile-a, so it has since been deleted.
        control.controlMode.value = 'automatic'
        await nextTick()
        expect(control.selectedProfileUID.value).toBeUndefined()
    })

    // An edit in progress outranks the memory: the user picked that one.
    it('leaves a profile the user has already picked alone', async () => {
        const settings = useFakeSettingsStore()
        settings.profiles.push({ uid: 'profile-a', name: 'Quiet' })
        settings.reload([[CHANNEL, reading({ profile_uid: 'profile-a' })]])
        const control = useChannelControl(DEVICE, CHANNEL)
        settings.reload([[CHANNEL, reading({ speed_fixed: 40 })]])
        await nextTick()

        control.selectedProfileUID.value = 'profile-b'
        control.controlMode.value = 'automatic'
        await nextTick()
        expect(control.selectedProfileUID.value).toBe('profile-b')
    })

    // Choosing a control mode writes nothing on its own, so the page has to
    // report that there is something to apply. Without it a user sets a fixed
    // speed, leaves, and the fan carries on as it was.
    it('counts a control mode change as something to apply', async () => {
        const settings = useFakeSettingsStore()
        settings.profiles.push({ uid: 'profile-a', name: 'Quiet' })
        settings.reload([[CHANNEL, reading({ profile_uid: 'profile-a' })]])
        const control = useChannelControl(DEVICE, CHANNEL)
        expect(control.isDirty.value).toBe(false)

        control.controlMode.value = 'manual'
        expect(control.isDirty.value).toBe(true)

        control.controlMode.value = 'unmanaged'
        expect(control.isDirty.value).toBe(true)

        control.controlMode.value = 'automatic'
        await nextTick()
        expect(control.isDirty.value).toBe(false)
    })

    it('has nothing to apply when curve mode has no curve to write', async () => {
        const settings = useFakeSettingsStore()
        settings.reload([[CHANNEL, reading({ speed_fixed: 40 })]])
        const control = useChannelControl(DEVICE, CHANNEL)

        control.controlMode.value = 'automatic'
        await nextTick()
        expect(control.selectedProfileUID.value).toBeUndefined()
        expect(control.isDirty.value).toBe(false)
    })

    // The embedded profile editor saves through the page's apply, and a save its
    // own validation rejected must not be followed by an assignment.
    it('saves a dirty editor first and stops when the save was rejected', async () => {
        useFakeSettingsStore().reload([[CHANNEL, reading({ profile_uid: 'profile-a' })]])
        const control = useChannelControl(DEVICE, CHANNEL)
        control.selectedProfileUID.value = 'profile-b'

        let saves = 0
        control.editorRef.value = {
            contextIsDirty: true,
            saveProfileState: () => {
                saves += 1
            },
        }
        await control.apply()
        expect(saves).toBe(1)
        expect(savedProfile).toEqual([])

        control.editorRef.value = {
            contextIsDirty: false,
            saveProfileState: () => {
                saves += 1
            },
        }
        await control.apply()
        expect(saves).toBe(1)
        expect(savedProfile).toEqual([
            { deviceUID: DEVICE, channelName: CHANNEL, profileUID: 'profile-b' },
        ])
    })
})
