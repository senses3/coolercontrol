// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { v4 as uuidV4 } from 'uuid'
import { useToast } from '@/shell/toast'
import { useCalibrationStore } from '@/stores/CalibrationStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { Profile, ProfileType } from '@/models/Profile.ts'
import {
    DeviceSettingWriteManualDTO,
    DeviceSettingWriteProfileDTO,
} from '@/models/DaemonSettings.ts'
import { ErrorResponse } from '@/models/ErrorResponse.ts'
import type { UID } from '@/models/Device.ts'

/** Guards the numbered-suffix search so a name clash cannot spin. */
const MAX_NAME_ATTEMPTS = 99

/**
 * Forking a profile for one channel, with an optional calibration remap.
 *
 * Calibration does not change stored settings, it changes their meaning. A
 * point authored as device-duty 50 is reinterpreted as true-duty once the
 * channel is calibrated, and the dispatcher maps it back out through
 * `true_to_device` on every write, so the fan runs faster than it used to.
 * Converting sends the stored duties through the daemon's inverse, giving the
 * pre-image: writing those values reproduces the original behavior.
 *
 * A conversion is only correct once. Running it on already-converted values
 * maps them a second time, so callers must confirm before converting, and the
 * original profile is always left untouched so the fork can just be deleted.
 */
export function useCalibrationConversion(
    deviceUID: UID,
    channelName: string,
    channelLabel: () => string,
) {
    const { t } = useI18n()
    const toast = useToast()
    const settingsStore = useSettingsStore()
    const deviceStore = useDeviceStore()
    const calibrationStore = useCalibrationStore()

    /**
     * Stepped calibrations are written through unmapped, so there is nothing
     * to convert. Warnings do not disqualify a channel: the dispatcher gates
     * the remap on Stepped alone, so a Smooth-with-warnings channel is
     * remapped at runtime and needs converting like any other.
     */
    const isConvertible = computed((): boolean => {
        const status = calibrationStore.statusFor(deviceUID, channelName)
        if (status?.phase !== 'completed') return false
        return status.calibration.curve_kind === 'Smooth'
    })

    /**
     * Mix and Overlay derive their output from member profiles, so there is
     * nothing of their own to remap; convert the members instead.
     */
    const canConvertProfile = (profile: Profile): boolean => {
        if (profile.uid === '0') return false
        return profile.p_type === ProfileType.Graph || profile.p_type === ProfileType.Fixed
    }

    const failed = (result: unknown, fallbackKey: string): boolean => {
        if (!(result instanceof ErrorResponse)) return false
        toast.add({
            severity: 'error',
            summary: t('common.error'),
            detail: result.error || t(fallbackKey),
            life: 6000,
        })
        return true
    }

    /** `"Name (Fan)"`, numbered when a profile already holds that name. */
    const forkName = (sourceName: string): string => {
        const base = `${sourceName} (${channelLabel()})`
        const taken = (name: string): boolean =>
            settingsStore.profiles.some((profile) => profile.name === name)
        if (!taken(base)) return base
        for (let attempt = 2; attempt <= MAX_NAME_ATTEMPTS; attempt++) {
            const candidate = `${base} ${attempt}`
            if (!taken(candidate)) return candidate
        }
        return `${base} ${uuidV4().slice(0, 8)}`
    }

    /** The duties a conversion would remap, in the order they are stored. */
    const dutiesOf = (profile: Profile): Array<number> =>
        profile.p_type === ProfileType.Graph
            ? profile.speed_profile.map((point) => point[1])
            : [profile.speed_fixed ?? 0]

    const applyDuties = (profile: Profile, duties: Array<number>): void => {
        if (profile.p_type === ProfileType.Graph) {
            profile.speed_profile = profile.speed_profile.map((point, index) => [
                point[0],
                duties[index],
            ])
            return
        }
        profile.speed_fixed = duties[0]
    }

    /**
     * Deep-clones the source, saves the fork, and assigns it to this channel.
     * `mappedDuties` (when given) replaces the cloned duties in place. The
     * source is never touched, so an unwanted fork is just a delete.
     */
    async function forkProfile(
        source: Profile,
        mappedDuties?: Array<number>,
    ): Promise<Profile | undefined> {
        const forked = plainToInstance(Profile, instanceToPlain(source))
        forked.uid = uuidV4()
        forked.name = forkName(source.name)
        if (mappedDuties != null) {
            applyDuties(forked, mappedDuties)
        }
        settingsStore.profiles.push(forked)
        const saved = await settingsStore.saveProfile(forked.uid)
        if (!saved) {
            // Drop the phantom so the picker does not offer an unsaved profile.
            settingsStore.profiles.splice(settingsStore.profiles.indexOf(forked), 1)
            return undefined
        }
        await settingsStore.saveDaemonDeviceSettingProfile(
            deviceUID,
            channelName,
            new DeviceSettingWriteProfileDTO(forked.uid),
        )
        return forked
    }

    /**
     * A duty under the calibrated sustain floor has no true-duty that
     * reproduces it: the forward map jumps from off straight to the floor,
     * so everything between is unreachable. Converting picks the nearest
     * option, which is off, and that must never happen silently.
     */
    function warnAboutFlooredPoints(source: Array<number>, mapped: Array<number>): void {
        const count = source.filter((duty, index) => duty > 0 && mapped[index] === 0).length
        if (count === 0) return
        toast.add({
            severity: 'warn',
            summary: t('layout.shell.coolingPage.convert.floorHeading'),
            detail: t('layout.shell.coolingPage.convert.floorNotice', {
                count,
                channel: channelLabel(),
            }),
            life: 10000,
        })
    }

    /**
     * Modes hold their own copy of each channel assignment, so a Mode that
     * still names the original profile re-applies the unconverted values when
     * activated. Nothing here can safely rewrite that for the user.
     */
    function remindAboutModes(originalUID: UID): void {
        const names = settingsStore.modes
            .filter((mode) =>
                mode.device_settings.some(
                    ([modeDeviceUID, settings]) =>
                        modeDeviceUID === deviceUID &&
                        settings.some(
                            (setting) =>
                                setting.channel_name === channelName &&
                                setting.profile_uid === originalUID,
                        ),
                ),
            )
            .map((mode) => mode.name)
        if (names.length === 0) return
        toast.add({
            severity: 'warn',
            summary: t('layout.shell.coolingPage.convert.modesHeading'),
            detail: t('layout.shell.coolingPage.convert.modesReminder', {
                modes: names.join(', '),
                channel: channelLabel(),
            }),
            life: 10000,
        })
    }

    /** Forks the assigned profile with converted duties and assigns the fork. */
    async function convertProfile(source: Profile): Promise<Profile | undefined> {
        const duties = dutiesOf(source)
        // An empty curve has nothing to map, and the daemon rejects an
        // empty list, so skip the round trip rather than raise an error.
        if (duties.length === 0) return undefined
        const mapped = await deviceStore.daemonClient.mapCalibrationDuties(
            deviceUID,
            channelName,
            duties,
        )
        if (mapped instanceof ErrorResponse) {
            failed(mapped, 'layout.shell.coolingPage.convert.error')
            return undefined
        }
        if (mapped == null) return undefined
        const forked = await forkProfile(source, mapped)
        if (forked == null) return undefined
        warnAboutFlooredPoints(duties, mapped)
        remindAboutModes(source.uid)
        return forked
    }

    /**
     * Converts the channel's manual duty in place. A fixed duty belongs to the
     * channel, not to a shared profile, so there is nothing to fork.
     */
    async function convertManualDuty(duty: number): Promise<number | undefined> {
        const mapped = await deviceStore.daemonClient.mapCalibrationDuties(deviceUID, channelName, [
            duty,
        ])
        if (mapped instanceof ErrorResponse) {
            failed(mapped, 'layout.shell.coolingPage.convert.error')
            return undefined
        }
        if (mapped == null) return undefined
        const converted = mapped[0]
        await settingsStore.saveDaemonDeviceSettingManual(
            deviceUID,
            channelName,
            new DeviceSettingWriteManualDTO(converted),
        )
        return converted
    }

    return {
        isConvertible,
        canConvertProfile,
        forkName,
        forkProfile,
        convertProfile,
        convertManualDuty,
    }
}
