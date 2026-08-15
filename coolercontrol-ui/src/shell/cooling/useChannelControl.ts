// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The control state a fan or pump page works in: how the daemon drives the
 * channel right now, the values the page edits, and the apply flow that writes
 * them back. Shared by the full channel page and the simple fan page so the two
 * cannot drift on what applying means.
 */

import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
    DeviceSettingWriteManualDTO,
    DeviceSettingWriteProfileDTO,
} from '@/models/DaemonSettings.ts'
import type { Device, UID } from '@/models/Device.ts'
import type { Profile } from '@/models/Profile.ts'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'

export type ControlMode = 'automatic' | 'manual' | 'unmanaged'

export function useChannelControl(deviceUID: UID, channelName: string) {
    const deviceStore = useDeviceStore()
    const settingsStore = useSettingsStore()
    const { currentDeviceStatus } = storeToRefs(deviceStore)

    const device = computed<Device | undefined>(() => {
        for (const candidate of deviceStore.allDevices()) {
            if (candidate.uid === deviceUID) return candidate
        }
        return undefined
    })
    const channelInfo = computed(() => device.value?.info?.channels.get(channelName))
    const speedOptions = computed(() => channelInfo.value?.speed_options)
    const controllable = computed(() => speedOptions.value?.fixed_enabled ?? false)

    const uiSetting = computed(() =>
        settingsStore.allUIDeviceSettings.get(deviceUID)?.sensorsAndChannels.get(channelName),
    )
    const channelLabel = computed(() => uiSetting.value?.name ?? channelName)
    const defaultLabel = computed(() => settingsStore.defaultChannelLabel(deviceUID, channelName))
    const deviceLabel = computed(() => settingsStore.allUIDeviceSettings.get(deviceUID)?.name ?? '')
    const saveChannelName = async (newName: string): Promise<boolean> =>
        await settingsStore.saveChannelName(deviceUID, channelName, newName)

    const daemonSetting = computed(() =>
        settingsStore.allDaemonDeviceSettings.get(deviceUID)?.settings.get(channelName),
    )

    const liveDuty = computed(
        () => currentDeviceStatus.value.get(deviceUID)?.get(channelName)?.duty,
    )
    const liveRpm = computed(() => currentDeviceStatus.value.get(deviceUID)?.get(channelName)?.rpm)

    const controlModeOf = (): ControlMode => {
        if (daemonSetting.value?.speed_fixed != null) return 'manual'
        if (daemonSetting.value?.profile_uid != null && daemonSetting.value.profile_uid !== '0') {
            return 'automatic'
        }
        return 'unmanaged'
    }
    const manualDutyOf = (): number =>
        daemonSetting.value?.speed_fixed ?? Number(liveDuty.value ?? '50')
    const profileUIDOf = (): UID | undefined =>
        daemonSetting.value?.profile_uid !== '0' ? daemonSetting.value?.profile_uid : undefined

    const controlMode = ref<ControlMode>(controlModeOf())
    const manualDuty = ref<number>(manualDutyOf())
    const selectedProfileUID = ref<UID | undefined>(profileUIDOf())

    // Activating a Mode rewrites this channel's setting while the page stays mounted,
    // as does any other client. The state above is seeded once, so follow the daemon
    // whenever its setting really changes. Separate sources, not one array getter: the
    // DTO is a new object after every reload, so only per-value comparison stays quiet
    // on reloads that left this channel alone.
    watch(
        [() => daemonSetting.value?.profile_uid, () => daemonSetting.value?.speed_fixed],
        (): void => {
            controlMode.value = controlModeOf()
            manualDuty.value = manualDutyOf()
            selectedProfileUID.value = profileUIDOf()
        },
    )

    // Remember whichever profile the daemon has driving this channel, taken from
    // its setting rather than from applying here, so every path counts: this
    // page, a wizard, a Mode, another client. Recorded up front as well, or the
    // switch that drops the assignment would be the first thing observed and
    // there would be nothing left to remember.
    const rememberProfile = (): void => {
        const uid = profileUIDOf()
        if (uid != null && uiSetting.value != null) uiSetting.value.lastProfileUID = uid
    }
    rememberProfile()
    watch(() => daemonSetting.value?.profile_uid, rememberProfile)

    // Returning a channel to a profile offers back the one it last ran, instead
    // of an empty picker (or, in the simple interface, no picker at all). Only
    // a preselection: nothing is written until apply.
    watch(controlMode, (mode) => {
        if (mode !== 'automatic' || selectedProfileUID.value != null) return
        const remembered = uiSetting.value?.lastProfileUID
        if (remembered == null) return
        if (settingsStore.profiles.some((profile) => profile.uid === remembered)) {
            selectedProfileUID.value = remembered
        }
    })

    const selectedProfile = computed<Profile | undefined>(() =>
        settingsStore.profiles.find((profile) => profile.uid === selectedProfileUID.value),
    )

    // channels (other than this one) also driven by the selected profile
    const sharedChannels = computed<Array<{ deviceUID: UID; channelName: string }>>(() => {
        if (selectedProfileUID.value == null) return []
        const users: Array<{ deviceUID: UID; channelName: string }> = []
        for (const [devUID, deviceSettings] of settingsStore.allDaemonDeviceSettings) {
            for (const [chName, setting] of deviceSettings.settings) {
                if (setting.profile_uid !== selectedProfileUID.value) continue
                if (devUID === deviceUID && chName === channelName) continue
                users.push({ deviceUID: devUID, channelName: chName })
            }
        }
        return users
    })

    const applying = ref(false)
    // The embedded profile editor and the channel extension settings both save
    // through this page's apply, so the page hands their instances back here.
    //
    // Setter functions rather than the refs themselves: `:ref="someRef"` in a
    // <script setup> template compiles to `ref: _unref(someRef)`, which hands
    // the binding the ref's value (undefined) instead of the ref, and it then
    // never populates. A function ref is called with the instance, and stays
    // the same function across renders, so nothing churns.
    const editorRef = ref()
    const extensionSettingsRef = ref()
    const setEditorRef = (instance: unknown): void => {
        editorRef.value = instance
    }
    const setExtensionSettingsRef = (instance: unknown): void => {
        extensionSettingsRef.value = instance
    }
    const editorDirty = computed<boolean>(() => editorRef.value?.contextIsDirty === true)

    const assignmentDirty = computed<boolean>(() => {
        if (controlMode.value === 'manual') {
            return daemonSetting.value?.speed_fixed !== manualDuty.value
        }
        if (controlMode.value === 'unmanaged') {
            return (
                daemonSetting.value?.speed_fixed != null ||
                (daemonSetting.value?.profile_uid != null &&
                    daemonSetting.value.profile_uid !== '0')
            )
        }
        return daemonSetting.value?.profile_uid !== selectedProfileUID.value
    })

    // Everything apply would write. A control mode is chosen on the page and
    // only reaches the daemon on apply, so this is also what makes leaving the
    // page a loss.
    const isDirty = computed<boolean>(() => {
        if (!controllable.value) return false
        if (controlMode.value === 'automatic') {
            // Curve mode with nothing chosen has nothing to write, so there is
            // nothing to lose either.
            if (selectedProfileUID.value == null) return false
            return assignmentDirty.value || editorDirty.value
        }
        return assignmentDirty.value
    })

    const canApply = computed<boolean>(() => isDirty.value && !applying.value)

    const apply = async (): Promise<void> => {
        if (applying.value) return
        applying.value = true
        try {
            if (controlMode.value === 'manual') {
                await settingsStore.saveDaemonDeviceSettingManual(
                    deviceUID,
                    channelName,
                    new DeviceSettingWriteManualDTO(manualDuty.value),
                )
            } else if (controlMode.value === 'unmanaged') {
                await settingsStore.saveDaemonDeviceSettingProfile(
                    deviceUID,
                    channelName,
                    new DeviceSettingWriteProfileDTO('0'),
                )
            } else if (selectedProfileUID.value != null) {
                if (editorDirty.value) {
                    await editorRef.value?.saveProfileState?.()
                    // still dirty means the editor's validation rejected the save
                    if (editorDirty.value) return
                }
                if (assignmentDirty.value) {
                    await settingsStore.saveDaemonDeviceSettingProfile(
                        deviceUID,
                        channelName,
                        new DeviceSettingWriteProfileDTO(selectedProfileUID.value),
                    )
                }
            }
            extensionSettingsRef.value?.saveChannelExtensionSettings?.()
        } finally {
            applying.value = false
        }
    }

    return {
        device,
        channelInfo,
        speedOptions,
        controllable,
        uiSetting,
        channelLabel,
        defaultLabel,
        deviceLabel,
        saveChannelName,
        daemonSetting,
        liveDuty,
        liveRpm,
        controlMode,
        manualDuty,
        selectedProfileUID,
        selectedProfile,
        sharedChannels,
        applying,
        editorRef,
        setEditorRef,
        setExtensionSettingsRef,
        editorDirty,
        assignmentDirty,
        isDirty,
        canApply,
        apply,
    }
}
