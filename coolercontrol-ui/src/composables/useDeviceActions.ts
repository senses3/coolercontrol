// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Device hardware-settings mutations (confirm + save + toast + daemon
// restart), ported from the old tree's extension-settings popover and the
// settings Device tab. Lives here so the shell's DevicePage stays free of
// direct PrimeVue imports (dependency discipline).

import { useConfirm } from '@/shell/confirm'
import { useToast } from '@/shell/toast'
import { useI18n } from 'vue-i18n'
import { mdiAlertOutline } from '@mdi/js'
import type { UID } from '@/models/Device.ts'
import { CCChannelSettings, CoolerControlDeviceSettingsDTO } from '@/models/CCSettings.ts'
import { ErrorResponse } from '@/models/ErrorResponse.ts'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'

export function useDeviceActions() {
    const confirm = useConfirm()
    const toast = useToast()
    const { t } = useI18n()
    const deviceStore = useDeviceStore()
    const settingsStore = useSettingsStore()

    const saveAndRestart = async (ccSetting: CoolerControlDeviceSettingsDTO): Promise<boolean> => {
        const result = await deviceStore.daemonClient.saveCCDeviceSettings(ccSetting.uid, ccSetting)
        // give the system a moment to make sure the setting has been saved
        await deviceStore.sleep(50)
        if (result === true) {
            toast.add({
                severity: 'success',
                summary: t('layout.settings.success'),
                detail: t('layout.settings.successDetail'),
                life: 6000,
            })
            await deviceStore.daemonClient.shutdownDaemon()
            await deviceStore.waitAndReload()
            return true
        }
        toast.add({
            severity: 'error',
            summary: t('common.error'),
            detail: result.error || t('layout.settings.devices.unknownError'),
            life: 6000,
        })
        return false
    }

    const confirmRestart = (accept: () => void | Promise<void>, reject?: () => void): void => {
        confirm.require({
            header: t('layout.settings.restartHeader'),
            message: t('layout.settings.applySettingAndRestart'),
            icon: mdiAlertOutline,
            defaultFocus: 'accept',
            acceptLabel: t('common.yes'),
            rejectLabel: t('common.no'),
            accept,
            reject,
        })
    }

    const setDirectAccess = (deviceUID: UID, value: boolean, onReject: () => void): void => {
        confirmRestart(async () => {
            const ccSetting = settingsStore.ccDeviceSettings.get(deviceUID)!
            ccSetting.extensions.direct_access = value
            await saveAndRestart(ccSetting)
        }, onReject)
    }

    const setDelayMillis = (deviceUID: UID, value: number, onReject: () => void): void => {
        confirmRestart(async () => {
            const ccSetting = settingsStore.ccDeviceSettings.get(deviceUID)!
            ccSetting.extensions.delay_millis = value
            await saveAndRestart(ccSetting)
        }, onReject)
    }

    // Disables the liquidctl device so the kernel hwmon driver takes over.
    const switchToHwmon = (deviceUID: UID, onReject: () => void): void => {
        confirm.require({
            header: t('components.deviceExtensionSettings.disableDevice'),
            message: t('components.deviceExtensionSettings.disableInfo'),
            icon: mdiAlertOutline,
            defaultFocus: 'accept',
            acceptLabel: t('common.yes'),
            rejectLabel: t('common.no'),
            accept: async () => {
                const ccSetting = settingsStore.ccDeviceSettings.get(deviceUID)!
                ccSetting.disable = true
                const success = await saveAndRestart(ccSetting)
                if (!success) onReject()
            },
            reject: onReject,
        })
    }

    const enableAmdOverdrive = async (): Promise<void> => {
        const result = await deviceStore.daemonClient.amdGpuOverdriveEnable()
        if (result instanceof ErrorResponse) {
            toast.add({
                severity: 'error',
                summary: t('common.error'),
                detail: result.error ?? t('layout.settings.devices.unknownError'),
                life: 6000,
            })
        } else {
            toast.add({
                severity: 'success',
                summary: t('components.deviceExtensionSettings.overdriveSuccess'),
                detail: result,
                life: 10000,
            })
        }
    }

    const applyThinkPadFanControl = (enable: boolean): void => {
        settingsStore.applyThinkPadFanControl(enable)
    }

    // Writes one device's enable/disable state into its CC settings in place,
    // returning the settings to save (or null if the device has no settings).
    // The daemon stamps device and channel detection memos itself, so
    // client-supplied names are ignored (write-deprecated).
    const writeDeviceEnableState = (
        deviceUID: UID,
        deviceEnabled: boolean,
        channelStates: Map<string, boolean>,
    ): CoolerControlDeviceSettingsDTO | null => {
        const ccSetting = settingsStore.ccDeviceSettings.get(deviceUID)
        if (ccSetting == null) {
            console.error(`CCDeviceSetting not found for this device: ${deviceUID}`)
            return null
        }
        ccSetting.disable = !deviceEnabled
        if (deviceEnabled) {
            for (const [channelName, enabled] of channelStates) {
                let channelSettings = ccSetting.channel_settings.get(channelName)
                if (channelSettings == null) {
                    // only already-applied channel changes exist in
                    // channel_settings; enabled channels with no settings are
                    // not persisted
                    if (enabled) continue
                    channelSettings = new CCChannelSettings()
                    ccSetting.channel_settings.set(channelName, channelSettings)
                }
                channelSettings.disabled = !enabled
            }
        }
        return ccSetting
    }

    // Batch sensor/device enable/disable across any number of devices,
    // preserving the old settings Device tab semantics: one confirm, then each
    // changed device is saved, then a single daemon restart on success. On
    // daemon rejection the error is shown verbatim (dependency messages) and
    // the daemon is NOT restarted.
    const applySensorChangesBatch = (
        edits: Map<UID, { deviceEnabled: boolean; channelStates: Map<string, boolean> }>,
        onDone: (success: boolean) => void,
    ): void => {
        confirm.require({
            message: t('layout.settings.devices.toggleRequiresRestart'),
            header: t('layout.settings.devices.enableDevices'),
            icon: mdiAlertOutline,
            accept: async () => {
                const settingsToSave: CoolerControlDeviceSettingsDTO[] = []
                for (const [deviceUID, edit] of edits) {
                    const ccSetting = writeDeviceEnableState(
                        deviceUID,
                        edit.deviceEnabled,
                        edit.channelStates,
                    )
                    if (ccSetting != null) settingsToSave.push(ccSetting)
                }
                if (settingsToSave.length === 0) {
                    onDone(false)
                    return
                }
                for (const ccSetting of settingsToSave) {
                    const result = await deviceStore.daemonClient.saveCCDeviceSettings(
                        ccSetting.uid,
                        ccSetting,
                    )
                    if (result instanceof ErrorResponse) {
                        toast.add({
                            severity: 'error',
                            summary: t('common.error'),
                            detail: result.error || t('layout.settings.devices.unknownError'),
                            life: 0,
                        })
                        onDone(false)
                        return
                    }
                }
                onDone(true)
                await deviceStore.daemonClient.shutdownDaemon()
                await deviceStore.waitAndReload()
            },
            reject: () => onDone(false),
        })
    }

    const applySensorChanges = (
        deviceUID: UID,
        deviceEnabled: boolean,
        channelStates: Map<string, boolean>,
        onDone: (success: boolean) => void,
    ): void => {
        applySensorChangesBatch(new Map([[deviceUID, { deviceEnabled, channelStates }]]), onDone)
    }

    return {
        setDirectAccess,
        setDelayMillis,
        switchToHwmon,
        enableAmdOverdrive,
        applyThinkPadFanControl,
        applySensorChanges,
        applySensorChangesBatch,
    }
}
