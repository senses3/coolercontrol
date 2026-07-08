/*
 * CoolerControl - monitor and control your cooling and other devices
 * Copyright (c) 2021-2025  Guy Boldon and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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

    // Batch sensor enable/disable for one device, preserving the settings
    // Device tab semantics: one confirm, save, restart on success; on daemon
    // rejection every error is shown verbatim (dependency messages) and the
    // daemon is NOT restarted.
    const applySensorChanges = (
        deviceUID: UID,
        deviceEnabled: boolean,
        channelStates: Map<string, boolean>,
        onDone: (success: boolean) => void,
    ): void => {
        confirm.require({
            message: t('layout.settings.devices.toggleRequiresRestart'),
            header: t('layout.settings.devices.enableDevices'),
            icon: mdiAlertOutline,
            accept: async () => {
                const ccSetting = settingsStore.ccDeviceSettings.get(deviceUID)
                if (ccSetting == null) {
                    console.error(`CCDeviceSetting not found for this device: ${deviceUID}`)
                    onDone(false)
                    return
                }
                // The daemon stamps device and channel detection memos itself;
                // client-supplied names are ignored (write-deprecated).
                ccSetting.disable = !deviceEnabled
                if (deviceEnabled) {
                    for (const [channelName, enabled] of channelStates) {
                        let channelSettings = ccSetting.channel_settings.get(channelName)
                        if (channelSettings == null) {
                            // only already-applied channel changes exist in
                            // channel_settings; enabled channels with no
                            // settings are not persisted
                            if (enabled) continue
                            channelSettings = new CCChannelSettings()
                            ccSetting.channel_settings.set(channelName, channelSettings)
                        }
                        channelSettings.disabled = !enabled
                    }
                }
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
                onDone(true)
                await deviceStore.daemonClient.shutdownDaemon()
                await deviceStore.waitAndReload()
            },
            reject: () => onDone(false),
        })
    }

    return {
        setDirectAccess,
        setDelayMillis,
        switchToHwmon,
        enableAmdOverdrive,
        applyThinkPadFanControl,
        applySensorChanges,
    }
}
