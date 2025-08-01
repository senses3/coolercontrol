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

import { defineStore } from 'pinia'
import { Device, DeviceType, type UID } from '@/models/Device'
import DaemonClient from '@/stores/DaemonClient'
import { ChannelInfo } from '@/models/ChannelInfo'
import { DeviceResponseDTO, StatusResponseDTO } from '@/stores/DataTransferModels'
import { defineAsyncComponent, inject, Ref, ref, shallowRef, triggerRef } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { ErrorResponse } from '@/models/ErrorResponse'
import { useDialog } from 'primevue/usedialog'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { plainToInstance } from 'class-transformer'
import { HealthCheck } from '@/models/HealthCheck.ts'
import { DaemonStatus, useDaemonState } from '@/stores/DaemonState.ts'
import { ElLoading } from 'element-plus'
import { svgLoader, svgLoaderBackground, svgLoaderViewBox } from '@/models/Loader.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import { AlertLog, AlertState } from '@/models/Alert.ts'
import { TempInfo } from '@/models/TempInfo.ts'
import { Emitter, EventType } from 'mitt'
import { ModeActivated } from '@/models/Mode.ts'
import { useI18n } from 'vue-i18n'

/**
 * This is similar to the model_view in the old GUI, where it held global state for all the various hooks and accesses
 */
export interface ChannelValues {
    temp?: string
    rpm?: string
    duty?: string
    freq?: string
    watts?: string
}

export const DEFAULT_NAME_STRING_LENGTH: number = 40

export const useDeviceStore = defineStore('device', () => {
    // Internal properties that we don't want to be reactive (overhead) ------------------------------------------------
    const devices = new Map<UID, Device>()
    // const DEFAULT_DAEMON_ADDRESS = 'localhost'
    // const DEFAULT_DAEMON_PORT = 11987
    // const DEFAULT_DAEMON_SSL_ENABLED = false
    const CONFIG_DAEMON_ADDRESS = 'daemonAddress'
    const CONFIG_DAEMON_PORT = 'daemonPort'
    const CONFIG_DAEMON_SSL_ENABLED = 'daemonSslEnabled'
    let daemonClient = new DaemonClient(getDaemonAddress(), getDaemonPort(), getDaemonSslEnabled())
    daemonClient.setUnauthorizedCallback(unauthorizedCallback)
    const confirm = useConfirm()
    const passwordDialog = defineAsyncComponent(() => import('../components/PasswordDialog.vue'))
    const dialog = useDialog()
    const toast = useToast()
    const emitter: Emitter<Record<EventType, any>> = inject('emitter')!
    const reloadAllStatusesThreshold: number = 5_000 // 5 seconds to handle when closing to tray & network latency
    const { t } = useI18n()
    // -----------------------------------------------------------------------------------------------------------------

    // Reactive properties ------------------------------------------------

    const currentDeviceStatus = shallowRef(new Map<UID, Map<string, ChannelValues>>())
    const isThinkPad = ref(false)
    const loggedIn: Ref<boolean> = ref(false)
    const logs: Ref<string> = ref('')

    // Getters ---------------------------------------------------------------------------------------------------------
    function allDevices(): IterableIterator<Device> {
        return devices.values()
    }

    function sleep(ms: number): Promise<number> {
        return new Promise((r) => setTimeout(r, ms))
    }

    async function waitAndReload(secs: number = 3): Promise<void> {
        ElLoading.service({
            lock: true,
            text: 'Restarting...',
            background: svgLoaderBackground,
            svg: svgLoader,
            svgViewBox: svgLoaderViewBox,
        })
        let s = 0
        const daemonState = useDaemonState()
        while (s < 30) {
            await sleep(1000)
            if (s > secs && daemonState.connected) {
                break
            }
            s++
        }
        reloadUI()
    }

    function reloadUI(): void {
        // When accessing the UI directly from the daemon, we need to refresh on the base URL.
        window.location.reload()
    }

    function toTitleCase(str: string): string {
        return str.replace(
            /\w\S*/g,
            (txt: string) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase(),
        )
    }

    function limitStringLength(str: string, limit: number): string {
        return str.substring(0, limit)
    }

    function sanitizeString(str: string, lengthLimit: number = DEFAULT_NAME_STRING_LENGTH): string {
        return limitStringLength(str.trim(), lengthLimit)
    }

    function round(value: number, precision: number = 0): number {
        const multiplier = Math.pow(10, precision)
        return Math.round(value * multiplier) / multiplier
    }

    function getREMSize(rem: number): number {
        const fontSize = window.getComputedStyle(document.querySelector('html')!).fontSize
        return parseFloat(fontSize) * rem
    }

    function isQtApp(): boolean {
        return 'ipc' in window
    }

    function isSafariWebKit(): boolean {
        return /apple computer/.test(navigator.vendor.toLowerCase())
    }

    function connectToQtIPC(): void {
        try {
            if (!('qt' in window)) {
                return
            }
            function loadScript(src: string, onload: () => void) {
                let script = document.createElement('script')
                // @ts-ignore
                script.onload = onload
                    ? onload
                    : function (e) {
                          // @ts-ignore
                          console.log(e.target.src + ' is loaded.')
                      }
                script.src = src
                script.async = false
                document.head.appendChild(script)
            }
            loadScript('qrc:///qtwebchannel/qwebchannel.js', (): void => {
                // @ts-ignore
                new QWebChannel(qt.webChannelTransport, async function (channel: any) {
                    // @ts-ignore
                    window.ipc = channel.objects.ipc
                    console.debug('Connected to Qt WebChannel, ready to send/receive messages!')
                })
            })
        } catch (e) {
            console.debug('Could not connect to Qt: ' + e)
        }
    }

    // Private methods ------------------------------------------------
    /**
     * Sorts the devices in the DeviceResponseDTO by first type, and then by typeIndex
     */
    function sortDevices(dto: DeviceResponseDTO): void {
        dto.devices.sort((a, b) => {
            const aTypeOrdinal = Object.values(DeviceType).indexOf(a.type)
            const bTypeOrdinal = Object.values(DeviceType).indexOf(b.type)
            if (aTypeOrdinal > bTypeOrdinal) {
                return 1
            } else if (aTypeOrdinal < bTypeOrdinal) {
                return -1
            } else if (a.type_index > b.type_index) {
                return 1
            } else if (a.type_index < b.type_index) {
                return -1
            } else {
                return 0
            }
        })
    }

    /**
     * Sorts channels by channel name
     */
    function sortChannels(device: Device): void {
        if (device.info?.channels) {
            device.info.channels = new Map<string, ChannelInfo>(
                [...device.info.channels.entries()].sort(([c1name, c1i], [c2name, c2i]) => {
                    // sort by channel type first, then by name
                    const channelTypeCompare = getChannelPrio(c1i) - getChannelPrio(c2i)
                    return channelTypeCompare === 0
                        ? c1name.localeCompare(c2name, undefined, {
                              numeric: true,
                              sensitivity: 'base',
                          })
                        : channelTypeCompare
                }),
            )
        }
        if (device.info?.temps) {
            device.info.temps = new Map<string, TempInfo>(
                [...device.info.temps.entries()].sort(([c1name], [c2name]) => {
                    return c1name.localeCompare(c2name, undefined, {
                        numeric: true,
                        sensitivity: 'base',
                    })
                }),
            )
        }
    }

    function getChannelPrio(channelInfo: ChannelInfo): number {
        // freq, power, load, fans, lightings, lcds, others by name only
        // multiple channels of the same type are sorted by name numerically
        if (channelInfo.speed_options != null) {
            return 11
        } else if (channelInfo.lighting_modes.length > 0) {
            return 12
        } else if (channelInfo.lcd_info != null) {
            return 13
        } else if (channelInfo.label?.toLowerCase().includes('freq')) {
            return 1
        } else if (channelInfo.label?.toLowerCase().includes('power')) {
            return 2
        } else if (channelInfo.label?.toLowerCase().includes('load')) {
            return 3
        }
        return 14
    }

    async function unauthorizedCallback(error: any): Promise<void> {
        if (error.response.status === 401 || error.response.status === 403) {
            toast.add({
                severity: 'error',
                summary: t('device_store.unauthorized.summary'),
                detail: t('device_store.unauthorized.detail'),
                life: 3000,
            })
        }
    }

    async function requestPasswd(retryCount: number = 1): Promise<void> {
        setTimeout(async () => {
            // wait until the Onboarding dialog isn't open without blocking:
            const settingsStore = useSettingsStore()
            while (settingsStore.showOnboarding) {
                await sleep(1000)
            }
            dialog.open(passwordDialog, {
                props: {
                    header: t('auth.enterPassword'),
                    position: 'center',
                    modal: true,
                    dismissableMask: false,
                },
                data: {
                    setPasswd: false,
                },
                onClose: async (options: any) => {
                    if (options.data && options.data.passwd) {
                        const passwdSuccess = await daemonClient.login(options.data.passwd)
                        if (passwdSuccess) {
                            toast.add({
                                severity: 'success',
                                summary: t('device_store.login.success.summary'),
                                detail: t('device_store.login.success.detail'),
                                life: 3000,
                            })
                            loggedIn.value = true
                            console.info('Login successful')
                            return
                        }
                        toast.add({
                            severity: 'error',
                            summary: t('device_store.login.failed.summary'),
                            detail: t('device_store.login.failed.detail'),
                            life: 3000,
                        })
                        if (retryCount > 2) {
                            return
                        }
                        await requestPasswd(++retryCount)
                    }
                },
            })
        })
    }

    function getDaemonAddress(): string {
        // const defaultAddress: string = isQtApp()
        //     ? DEFAULT_DAEMON_ADDRESS
        //     : window.location.hostname
        const defaultAddress: string = window.location.hostname
        return localStorage.getItem(CONFIG_DAEMON_ADDRESS) || defaultAddress
    }

    function setDaemonAddress(address: string): void {
        localStorage.setItem(CONFIG_DAEMON_ADDRESS, address)
    }

    function clearDaemonAddress(): void {
        localStorage.removeItem(CONFIG_DAEMON_ADDRESS)
    }

    function getDaemonPort(): number {
        // const defaultPort: string = isQtApp()
        //     ? DEFAULT_DAEMON_PORT.toString()
        //     : window.location.port || (window.location.protocol === 'https:' ? '443' : '80')
        const defaultPort: string =
            window.location.port || (window.location.protocol === 'https:' ? '443' : '80')
        return parseInt(localStorage.getItem(CONFIG_DAEMON_PORT) || defaultPort)
    }

    function setDaemonPort(port: number): void {
        localStorage.setItem(CONFIG_DAEMON_PORT, port.toString())
    }

    function clearDaemonPort(): void {
        localStorage.removeItem(CONFIG_DAEMON_PORT)
    }

    function getDaemonSslEnabled(): boolean {
        // const defaultSslEnabled: boolean = isQtApp()
        //     ? DEFAULT_DAEMON_SSL_ENABLED
        //     : window.location.protocol === 'https:'
        const defaultSslEnabled: boolean = window.location.protocol === 'https:'
        return localStorage.getItem(CONFIG_DAEMON_SSL_ENABLED) != null
            ? localStorage.getItem(CONFIG_DAEMON_SSL_ENABLED) === 'true'
            : defaultSslEnabled
    }

    function setDaemonSslEnabled(sslEnabled: boolean): void {
        localStorage.setItem(CONFIG_DAEMON_SSL_ENABLED, sslEnabled.toString())
    }

    function clearDaemonSslEnabled(): void {
        localStorage.removeItem(CONFIG_DAEMON_SSL_ENABLED)
    }

    // Actions -----------------------------------------------------------------------
    async function login(): Promise<void> {
        // Likely no long needed to skip for Qt (persisted session cookie in Qt)
        // if (!isQtApp()) {
        const sessionIsValid = await daemonClient.sessionIsValid()
        if (sessionIsValid) {
            loggedIn.value = true
            console.info('Login Session still valid')
            toast.add({
                severity: 'info',
                summary: t('layout.topbar.login'),
                detail: t('layout.topbar.loginSuccessful'),
                life: 1500,
            })
            return
        }
        const defaultLoginSuccessful = await daemonClient.login()
        if (defaultLoginSuccessful) {
            loggedIn.value = true
            console.info('Login successful')
            toast.add({
                severity: 'info',
                summary: t('layout.topbar.login'),
                detail: t('layout.topbar.loginSuccessful'),
                life: 1500,
            })
        } else {
            await requestPasswd()
        }
    }

    async function setPasswd(): Promise<void> {
        dialog.open(passwordDialog, {
            props: {
                header: t('auth.setNewPassword'),
                position: 'center',
                modal: true,
                dismissableMask: false,
            },
            data: {
                setPasswd: true,
            },
            onClose: async (options: any) => {
                if (options.data && options.data.passwd) {
                    const response = await daemonClient.setPasswd(options.data.passwd)
                    if (response instanceof ErrorResponse) {
                        toast.add({
                            severity: 'error',
                            summary: t('device_store.password.set_failed.summary'),
                            detail: response.error,
                            life: 3000,
                        })
                    } else {
                        toast.add({
                            severity: 'success',
                            summary: t('device_store.password.set_success.summary'),
                            detail: t('device_store.password.set_success.detail'),
                            life: 3000,
                        })
                    }
                }
            },
        })
    }

    async function logout(): Promise<void> {
        await daemonClient.logout()
        loggedIn.value = false
        console.info('Admin Logged Out')
        toast.add({
            severity: 'info',
            summary: t('device_store.logout.summary'),
            detail: t('device_store.logout.detail'),
            life: 3000,
        })
    }

    async function health(): Promise<HealthCheck> {
        return await daemonClient.health()
    }

    async function loadLogs(): Promise<void> {
        logs.value = await daemonClient.logs()
    }

    async function acknowledgeIssues(): Promise<void> {
        return await daemonClient.acknowledgeIssues()
    }

    async function initializeDevices(): Promise<boolean> {
        console.info('Initializing Devices')
        const handshakeSuccessful = await daemonClient.handshake()
        if (!handshakeSuccessful) {
            return false
        }
        const dto = await daemonClient.requestDevices()
        if (dto.devices.length === 0) {
            console.warn('There are no available devices!')
        }
        sortDevices(dto)
        for (const device of dto.devices) {
            if (device.info?.thinkpad_fan_control != null) {
                isThinkPad.value = true
            }
            if (device.lc_info?.unknown_asetek) {
                // wait until the Onboarding dialog isn't open without blocking:
                setTimeout(async () => {
                    const settingsStore = useSettingsStore()
                    while (settingsStore.showOnboarding) {
                        await sleep(1000)
                    }
                    confirm.require({
                        group: 'AseTek690',
                        message: `${device.type_index}`,
                        header: t('device_store.asetek.header'),
                        icon: 'pi pi-exclamation-triangle',
                        acceptLabel: t('components.aseTek690.acceptLabel'),
                        rejectLabel: t('components.aseTek690.rejectLabel'),
                        accept: async () => {
                            console.debug(`Setting device ${device.uid} as a Legacy 690`)
                            await handleAseTekResponse(device.uid, true)
                        },
                        reject: async () => {
                            console.debug(`Setting device ${device.uid} as a EVGA CLC`)
                            await handleAseTekResponse(device.uid, false)
                        },
                    })
                })
            }
            sortChannels(device)
            devices.set(device.uid, device)
        }
        await loadCompleteStatusHistory()
        console.debug('Initialized with devices:')
        console.debug(devices)
        return true
    }

    async function handleAseTekResponse(deviceUID: UID, isLegacy690: boolean): Promise<void> {
        const response = await daemonClient.setAseTekDeviceType(deviceUID, isLegacy690)
        if (response instanceof ErrorResponse) {
            toast.add({
                severity: 'error',
                summary: t('device_store.asetek.error.summary'),
                detail: response.error + ' - ' + t('device_store.asetek.error.detail'),
                life: 4000,
            })
            return
        }
        const msg = isLegacy690
            ? t('device_store.asetek.success.detail_legacy')
            : t('device_store.asetek.success.detail_evga')
        toast.add({
            severity: 'success',
            summary: t('device_store.asetek.success.summary'),
            detail: msg,
            life: 3000,
        })
        if (isLegacy690) {
            await daemonClient.shutdownDaemon()
            await waitAndReload()
        }
    }

    /**
     * requests and loads all the statuses for each device.
     */
    async function loadCompleteStatusHistory(): Promise<void> {
        const allStatusesDto = await daemonClient.completeStatusHistory()
        for (const dtoDevice of allStatusesDto.devices) {
            // not all device UIDs are present locally (composite can be ignored for example)
            if (devices.has(dtoDevice.uid)) {
                const statuses = devices.get(dtoDevice.uid)!.status_history
                statuses.length = 0 // clear array if this is a re-sync
                statuses.push(...dtoDevice.status_history) // shallow copy
            }
        }
        updateRecentDeviceStatus()
    }

    /**
     * Requests the most recent status for all devices and adds it to the current status array.
     * @return boolean true if only the most recent status was updated. False if all statuses were updated.
     */
    async function updateStatus(dto: StatusResponseDTO): Promise<boolean> {
        let onlyLatestStatus: boolean = true
        let timeDiffMillis: number = 0
        // now handled by server side events:
        // const dto = await daemonClient.recentStatus()
        if (dto.devices.length === 0 || dto.devices[0].status_history.length === 0) {
            return onlyLatestStatus // we can't update anything without data, which happens on daemon restart & resuming from sleep
        }
        if (devices.size > 0) {
            const device: Device = devices.values().next().value! // get the first device's timestamp
            timeDiffMillis = Math.abs(
                new Date(device.status.timestamp).getTime() -
                    new Date(dto.devices[0].status_history[0].timestamp).getTime(),
            )
            if (timeDiffMillis > reloadAllStatusesThreshold) {
                onlyLatestStatus = false
            }
        }

        if (onlyLatestStatus) {
            for (const dtoDevice of dto.devices) {
                // not all device UIDs are present locally (composite can be ignored for example)
                if (devices.has(dtoDevice.uid)) {
                    const statuses = devices.get(dtoDevice.uid)!.status_history
                    statuses.push(...dtoDevice.status_history)
                    statuses.shift()
                }
            }
            updateRecentDeviceStatus()
        } else {
            console.debug(
                `[${new Date().toUTCString()}]:\nDevice Statuses are out of sync by ${new Intl.NumberFormat().format(
                    timeDiffMillis,
                )}ms, reloading all states and statuses.`,
            )
            const settingsStore = useSettingsStore()
            await settingsStore.loadAlertsAndLogs()
            await settingsStore.getActiveModes()
            const healthCheck = await health()
            const daemonState = useDaemonState()
            daemonState.warnings = healthCheck.details.warnings
            daemonState.errors = healthCheck.details.errors
            if (daemonState.errors > 0) {
                await daemonState.setStatus(DaemonStatus.ERROR)
            } else if (daemonState.warnings > 0) {
                await daemonState.setStatus(DaemonStatus.WARN)
            } else {
                await daemonState.setStatus(DaemonStatus.OK)
            }
            await loadLogs()
            await loadCompleteStatusHistory()
        }
        return onlyLatestStatus
    }

    async function updateStatusFromSSE(): Promise<void> {
        const thisStore = useDeviceStore()
        const daemonState = useDaemonState()
        async function startSSE(): Promise<void> {
            await fetchEventSource(`${daemonClient.daemonURL}sse/status`, {
                async onmessage(event) {
                    const dto = plainToInstance(StatusResponseDTO, JSON.parse(event.data) as object)
                    await thisStore.updateStatus(dto)
                    await daemonState.setConnected(true)
                },
                async onclose() {
                    // attempt to re-establish connection automatically (resume/restart)
                    await daemonState.setConnected(false)
                    thisStore.loggedIn = false
                    await sleep(1000)
                    await startSSE()
                },
                // @ts-ignore
                // changing onerror to async causes spam retry loop
                onerror() {
                    daemonState.setConnected(false)
                    thisStore.loggedIn = false
                    // auto-retry every second
                },
            })
        }
        return await startSSE()
    }

    async function updateLogsFromSSE(): Promise<void> {
        const daemonState = useDaemonState()
        async function startLogSSE(): Promise<void> {
            await fetchEventSource(`${daemonClient.daemonURL}sse/logs`, {
                async onmessage(event) {
                    if (event.data.length === 0) return // keep-alive message
                    const newLog = event.data
                    logs.value = `${logs.value}${newLog}`
                    if (newLog.includes('ERROR')) {
                        await daemonState.setStatus(DaemonStatus.ERROR)
                    } else if (newLog.includes('WARN')) {
                        if (daemonState.status !== DaemonStatus.ERROR) {
                            await daemonState.setStatus(DaemonStatus.WARN)
                        }
                    }
                },
                async onclose() {
                    // attempt to re-establish connection automatically (resume/restart)
                    await sleep(1000)
                    await startLogSSE()
                },
                onerror() {
                    // auto-retry every second
                },
            })
        }
        return await startLogSSE()
    }

    async function updateActiveModeFromSSE(): Promise<void> {
        const settingsStore = useSettingsStore()
        async function startModeSSE(): Promise<void> {
            await fetchEventSource(`${daemonClient.daemonURL}sse/modes`, {
                async onmessage(event) {
                    if (event.data.length === 0) return // keep-alive message
                    const modeMessage = plainToInstance(
                        ModeActivated,
                        JSON.parse(event.data) as object,
                    )
                    settingsStore.modeActiveCurrent = modeMessage.uid
                    settingsStore.modeActivePrevious = modeMessage.previous_uid
                    await settingsStore.loadDaemonDeviceSettings() // need to reload all settings after applying mode
                    emitter.emit('active-modes-change-menu')
                },
                async onclose() {
                    // attempt to re-establish connection automatically (resume/restart)
                    await sleep(1000)
                    await startModeSSE()
                },
                onerror() {
                    // auto-retry every second
                },
            })
        }
        return await startModeSSE()
    }

    async function updateAlertsFromSSE(): Promise<void> {
        const settingsStore = useSettingsStore()
        async function startAlertSSE(): Promise<void> {
            await fetchEventSource(`${daemonClient.daemonURL}sse/alerts`, {
                async onmessage(event) {
                    if (event.data.length === 0) return // keep-alive message
                    const alertMessage = plainToInstance(AlertLog, JSON.parse(event.data) as object)
                    console.debug('Received Alert: ', alertMessage)
                    settingsStore.alertLogs.push(alertMessage)
                    let foundAlert = settingsStore.alerts.find(
                        (alert) => alert.uid === alertMessage.uid,
                    )
                    if (foundAlert) {
                        foundAlert.state = alertMessage.state
                    }
                    if (alertMessage.state === AlertState.Active) {
                        if (!settingsStore.alertsActive.includes(alertMessage.uid)) {
                            settingsStore.alertsActive.push(alertMessage.uid)
                        }
                        toast.add({
                            severity: 'error',
                            summary: t('views.alerts.alertTriggered'),
                            detail: `${alertMessage.name} - ${alertMessage.message}`,
                            life: 5000,
                        })
                    } else {
                        const activeIndex = settingsStore.alertsActive.findIndex(
                            (uid) => uid === alertMessage.uid,
                        )
                        if (activeIndex > -1) {
                            settingsStore.alertsActive.splice(activeIndex, 1)
                        }
                        toast.add({
                            severity: 'info',
                            summary: t('views.alerts.alertRecovered'),
                            detail: `${alertMessage.name} - ${alertMessage.message}`,
                            life: 3000,
                        })
                    }
                },
                async onclose() {
                    // attempt to re-establish connection automatically (resume/restart)
                    await startAlertSSE()
                },
                onerror() {
                    // auto-retry every second
                },
            })
        }
        return await startAlertSSE()
    }

    function updateRecentDeviceStatus(): void {
        for (const [uid, device] of devices) {
            if (!currentDeviceStatus.value.has(uid)) {
                currentDeviceStatus.value.set(uid, new Map<string, ChannelValues>())
            }
            let deviceStatuses = currentDeviceStatus.value.get(uid)!
            for (const temp of device.status.temps) {
                if (deviceStatuses.has(temp.name)) {
                    deviceStatuses.get(temp.name)!.temp = temp.temp.toFixed(1)
                } else {
                    deviceStatuses.set(temp.name, { temp: temp.temp.toFixed(1) })
                }
            }
            for (const channel of device.status.channels) {
                // This gives us both "load" and "speed" channels
                if (deviceStatuses.has(channel.name)) {
                    deviceStatuses.get(channel.name)!.duty = channel.duty?.toFixed(0)
                    deviceStatuses.get(channel.name)!.rpm = channel.rpm?.toFixed(0)
                    deviceStatuses.get(channel.name)!.freq = channel.freq?.toFixed(0)
                    deviceStatuses.get(channel.name)!.watts = channel.watts?.toFixed(1)
                } else {
                    deviceStatuses.set(channel.name, {
                        duty: channel.duty?.toFixed(0),
                        rpm: channel.rpm?.toFixed(0),
                        freq: channel.freq?.toFixed(0),
                        watts: channel.watts?.toFixed(1),
                    })
                }
            }
        }
        triggerRef(currentDeviceStatus)
    }

    console.debug(`Device Store created`)
    return {
        daemonClient,
        allDevices,
        sleep,
        waitAndReload,
        reloadUI,
        toTitleCase,
        getDaemonAddress,
        setDaemonAddress,
        clearDaemonAddress,
        getDaemonPort,
        setDaemonPort,
        clearDaemonPort,
        getDaemonSslEnabled,
        setDaemonSslEnabled,
        clearDaemonSslEnabled,
        login,
        logout,
        health,
        logs,
        acknowledgeIssues,
        loadLogs,
        setPasswd,
        initializeDevices,
        loggedIn,
        loadCompleteStatusHistory,
        updateStatus,
        updateStatusFromSSE,
        updateLogsFromSSE,
        updateAlertsFromSSE,
        updateActiveModeFromSSE,
        currentDeviceStatus,
        round,
        sanitizeString,
        getREMSize,
        isQtApp,
        isSafariWebKit,
        isThinkPad,
        connectToQtIPC,
    }
})
