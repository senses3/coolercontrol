<!--
  - CoolerControl - monitor and control your cooling and other devices
  - Copyright (c) 2021-2025  Guy Boldon and contributors
  -
  - This program is free software: you can redistribute it and/or modify
  - it under the terms of the GNU General Public License as published by
  - the Free Software Foundation, either version 3 of the License, or
  - (at your option) any later version.
  -
  - This program is distributed in the hope that it will be useful,
  - but WITHOUT ANY WARRANTY; without even the implied warranty of
  - MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  - GNU General Public License for more details.
  -
  - You should have received a copy of the GNU General Public License
  - along with this program.  If not, see <https://www.gnu.org/licenses/>.
  -->

<!-- Stress tests card, extracted from the dissolved AppInfoView. PrimeVue
  widgets live here so the shell Home page stays kit-clean. -->

<script setup lang="ts">
// @ts-ignore
import SvgIcon from '@jamescoyle/vue-icon/lib/svg-icon.vue'
import { mdiCircle } from '@mdi/js'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { useDeviceStore } from '@/stores/DeviceStore.ts'
import { useSettingsStore } from '@/stores/SettingsStore.ts'
import HelpTooltipIcon from '@/components/info/HelpTooltipIcon.vue'
import StressTestLabel from '@/components/info/StressTestLabel.vue'
import StressBackendSelect from '@/components/info/StressBackendSelect.vue'

const deviceStore = useDeviceStore()
const settingsStore = useSettingsStore()
const { t } = useI18n({ useScope: 'global' })

// Stress Test
const toast = useToast()
const confirm = useConfirm()
const cpuDuration = ref<number>(60)
const gpuDuration = ref<number>(60)
const ramDuration = ref<number>(60)
const driveDuration = ref<number>(60)
const cpuActive = ref(false)
const gpuActive = ref(false)
const ramActive = ref(false)
const driveActive = ref(false)
const cpuBackend = ref<string>('built_in')
const gpuBackend = ref<string>('built_in')
const ramBackend = ref<string>('built_in')
const driveBackend = ref<string>('built_in')
const stressNgAvailable = ref(false)
const cpuLoading = ref(false)
const gpuLoading = ref(false)
const ramLoading = ref(false)
const driveLoading = ref(false)
const availableDrives = ref<Array<{ device_path: string; model?: string; size_bytes: number }>>([])
const selectedDrive = ref<string | null>(null)
let statusPollInterval: ReturnType<typeof setInterval> | null = null

const pollStatus = async () => {
    const status = await deviceStore.daemonClient.stressTestStatus()
    cpuActive.value = status.cpu_active
    gpuActive.value = status.gpu_active
    ramActive.value = status.ram_active
    driveActive.value = status.drive_active
    cpuBackend.value = status.cpu_backend ?? 'built_in'
    gpuBackend.value = status.gpu_backend ?? 'built_in'
    ramBackend.value = status.ram_backend ?? 'built_in'
    driveBackend.value = status.drive_backend ?? 'built_in'
    stressNgAvailable.value = status.stress_ng_available ?? false
    if (
        !status.cpu_active &&
        !status.gpu_active &&
        !status.ram_active &&
        !status.drive_active &&
        statusPollInterval
    ) {
        clearInterval(statusPollInterval)
        statusPollInterval = null
    }
}

const backendLabel = (backend: string) =>
    backend === 'stress_ng' ? 'stress-ng' : t('views.appInfo.builtInBackend')

const startPolling = () => {
    if (!statusPollInterval) {
        statusPollInterval = setInterval(pollStatus, 2000)
    }
}

const needsPsuWarning = (starting: 'cpu' | 'gpu' | 'ram' | 'drive') => {
    // Warn only when GPU and CPU/RAM would run simultaneously.
    if (starting === 'gpu') return cpuActive.value || ramActive.value
    if (starting === 'cpu' || starting === 'ram') return gpuActive.value
    return false
}

const confirmOrRun = (action: () => void, starting: 'cpu' | 'gpu' | 'ram' | 'drive') => {
    if (needsPsuWarning(starting)) {
        confirm.require({
            message: t('views.appInfo.psuWarningMessage'),
            header: t('views.appInfo.psuWarningHeader'),
            icon: 'pi pi-exclamation-triangle',
            defaultFocus: 'reject',
            rejectLabel: t('common.cancel'),
            acceptLabel: t('views.appInfo.proceed'),
            accept: action,
        })
    } else {
        action()
    }
}

const doCpuStress = async () => {
    cpuLoading.value = true
    const err = await deviceStore.daemonClient.startCpuStress(
        undefined,
        cpuDuration.value,
        stressNgAvailable.value ? settingsStore.cpuStressBackend : undefined,
    )
    cpuLoading.value = false
    if (err) {
        toast.add({ severity: 'error', summary: 'CPU Stress', detail: err.error, life: 5000 })
    } else {
        cpuActive.value = true
        startPolling()
    }
}
const startCpuStress = () => confirmOrRun(doCpuStress, 'cpu')

const stopCpuStress = async () => {
    cpuLoading.value = true
    await deviceStore.daemonClient.stopCpuStress()
    cpuLoading.value = false
    cpuActive.value = false
}

const doGpuStress = async () => {
    gpuLoading.value = true
    const err = await deviceStore.daemonClient.startGpuStress(
        gpuDuration.value,
        stressNgAvailable.value ? settingsStore.gpuStressBackend : undefined,
    )
    gpuLoading.value = false
    if (err) {
        toast.add({ severity: 'error', summary: 'GPU Stress', detail: err.error, life: 5000 })
    } else {
        gpuActive.value = true
        startPolling()
    }
}
const startGpuStress = () => confirmOrRun(doGpuStress, 'gpu')

const stopGpuStress = async () => {
    gpuLoading.value = true
    await deviceStore.daemonClient.stopGpuStress()
    gpuLoading.value = false
    gpuActive.value = false
}

const doRamStress = async () => {
    ramLoading.value = true
    const err = await deviceStore.daemonClient.startRamStress(
        ramDuration.value,
        stressNgAvailable.value ? settingsStore.ramStressBackend : undefined,
    )
    ramLoading.value = false
    if (err) {
        toast.add({ severity: 'error', summary: 'RAM Stress', detail: err.error, life: 5000 })
    } else {
        ramActive.value = true
        startPolling()
    }
}
const startRamStress = () => confirmOrRun(doRamStress, 'ram')

const stopRamStress = async () => {
    ramLoading.value = true
    await deviceStore.daemonClient.stopRamStress()
    ramLoading.value = false
    ramActive.value = false
}

const driveLabel = (drive: { device_path: string; model?: string }) =>
    drive.model ? `${drive.model} (${drive.device_path})` : drive.device_path

const doDriveStress = async () => {
    if (!selectedDrive.value) return
    driveLoading.value = true
    const err = await deviceStore.daemonClient.startDriveStress(
        selectedDrive.value,
        undefined,
        driveDuration.value,
        stressNgAvailable.value ? settingsStore.driveStressBackend : undefined,
    )
    driveLoading.value = false
    if (err) {
        toast.add({ severity: 'error', summary: 'Drive Stress', detail: err.error, life: 5000 })
    } else {
        driveActive.value = true
        startPolling()
    }
}
const startDriveStress = () => confirmOrRun(doDriveStress, 'drive')

const stopDriveStress = async () => {
    driveLoading.value = true
    await deviceStore.daemonClient.stopDriveStress()
    driveLoading.value = false
    driveActive.value = false
}

const stopAllStress = async () => {
    cpuLoading.value = true
    gpuLoading.value = true
    ramLoading.value = true
    driveLoading.value = true
    await deviceStore.daemonClient.stopAllStress()
    cpuLoading.value = false
    gpuLoading.value = false
    ramLoading.value = false
    driveLoading.value = false
    cpuActive.value = false
    gpuActive.value = false
    ramActive.value = false
    driveActive.value = false
}

onBeforeUnmount(() => {
    if (statusPollInterval) {
        clearInterval(statusPollInterval)
    }
})
onMounted(async () => {
    const drives = await deviceStore.daemonClient.listDrivesForStress()
    availableDrives.value = drives
    if (drives.length > 0) {
        selectedDrive.value = drives[0].device_path
    }
    await pollStatus()
    if (cpuActive.value || gpuActive.value || ramActive.value || driveActive.value) {
        startPolling()
    }
})
</script>

<template>
    <div class="xl:col-span-2">
        <div class="bg-bg-two border border-border-one p-4 rounded-lg text-text-color">
            <div class="flex flex-row justify-between items-center mb-4">
                <div class="flex flex-row items-center gap-2">
                    <span class="font-semibold text-xl text-text-color">{{
                        t('views.appInfo.stressTest')
                    }}</span>
                    <help-tooltip-icon :tooltip="t('views.appInfo.stressTestTooltip')" />
                </div>
                <Button
                    :label="t('views.appInfo.stopAll')"
                    class="bg-red-600/80 hover:!bg-red-600 h-[2.375rem]"
                    :disabled="!cpuActive && !gpuActive && !ramActive && !driveActive"
                    @click="stopAllStress"
                />
            </div>
            <table class="border-separate border-spacing-y-2">
                <tbody>
                    <!-- CPU Stress -->
                    <tr>
                        <td class="pr-4">
                            <span class="font-bold text-lg">{{
                                t('views.appInfo.cpuStress')
                            }}</span>
                        </td>
                        <td class="pr-4">
                            <InputNumber
                                v-model="cpuDuration"
                                show-buttons
                                button-layout="horizontal"
                                :min="15"
                                :max="600"
                                :step="15"
                                suffix=" s"
                                class="w-32"
                                :disabled="cpuActive"
                                :input-style="{ width: '3.5rem' }"
                                input-class="!p-1.5 !text-sm"
                            >
                                <template #incrementicon>
                                    <span class="pi pi-plus" />
                                </template>
                                <template #decrementicon>
                                    <span class="pi pi-minus" />
                                </template>
                            </InputNumber>
                        </td>
                        <td class="pr-4">
                            <Button
                                v-if="!cpuActive"
                                :label="t('views.appInfo.start')"
                                class="bg-accent/80 hover:!bg-accent h-[2.375rem]"
                                :disabled="ramActive"
                                @click="startCpuStress"
                            />
                            <Button
                                v-else
                                :label="t('views.appInfo.stop')"
                                class="bg-red-600/80 hover:!bg-red-600 h-[2.375rem]"
                                @click="stopCpuStress"
                            />
                        </td>
                        <td>
                            <div class="flex items-center gap-2">
                                <svg-icon
                                    type="mdi"
                                    :class="
                                        cpuActive ? 'text-success' : 'text-text-color-secondary'
                                    "
                                    :path="mdiCircle"
                                    :size="deviceStore.getREMSize(0.75)"
                                />
                                <span class="text-sm">{{
                                    cpuActive
                                        ? t('views.appInfo.active')
                                        : t('views.appInfo.inactive')
                                }}</span>
                                <stress-backend-select
                                    v-if="stressNgAvailable && !cpuActive"
                                    v-model="settingsStore.cpuStressBackend"
                                    class="ml-1 stress-backend-select"
                                />
                                <span
                                    v-else
                                    class="text-xs text-text-color-secondary ml-1 opacity-70"
                                    >[{{ backendLabel(cpuBackend) }}]</span
                                >
                            </div>
                        </td>
                    </tr>
                    <!-- GPU Stress -->
                    <tr>
                        <td class="pr-4">
                            <stress-test-label
                                :label="t('views.appInfo.gpuStress')"
                                :tooltip="t('views.appInfo.gpuStressTooltip')"
                            />
                        </td>
                        <td class="pr-4">
                            <InputNumber
                                v-model="gpuDuration"
                                show-buttons
                                button-layout="horizontal"
                                :min="15"
                                :max="600"
                                :step="15"
                                suffix=" s"
                                class="w-32"
                                :disabled="gpuActive"
                                :input-style="{ width: '3.5rem' }"
                                input-class="!p-1.5 !text-sm"
                            >
                                <template #incrementicon>
                                    <span class="pi pi-plus" />
                                </template>
                                <template #decrementicon>
                                    <span class="pi pi-minus" />
                                </template>
                            </InputNumber>
                        </td>
                        <td class="pr-4">
                            <Button
                                v-if="!gpuActive"
                                :label="t('views.appInfo.start')"
                                class="bg-accent/80 hover:!bg-accent h-[2.375rem]"
                                @click="startGpuStress"
                            />
                            <Button
                                v-else
                                :label="t('views.appInfo.stop')"
                                class="bg-red-600/80 hover:!bg-red-600 h-[2.375rem]"
                                @click="stopGpuStress"
                            />
                        </td>
                        <td>
                            <div class="flex items-center gap-2">
                                <svg-icon
                                    type="mdi"
                                    :class="
                                        gpuActive ? 'text-success' : 'text-text-color-secondary'
                                    "
                                    :path="mdiCircle"
                                    :size="deviceStore.getREMSize(0.75)"
                                />
                                <span class="text-sm">{{
                                    gpuActive
                                        ? t('views.appInfo.active')
                                        : t('views.appInfo.inactive')
                                }}</span>
                                <stress-backend-select
                                    v-if="stressNgAvailable && !gpuActive"
                                    v-model="settingsStore.gpuStressBackend"
                                    class="ml-1 stress-backend-select"
                                />
                                <span
                                    v-else
                                    class="text-xs text-text-color-secondary ml-1 opacity-70"
                                    >[{{ backendLabel(gpuBackend) }}]</span
                                >
                            </div>
                        </td>
                    </tr>
                    <!-- RAM Stress -->
                    <tr>
                        <td class="pr-4">
                            <span class="font-bold text-lg">{{
                                t('views.appInfo.ramStress')
                            }}</span>
                        </td>
                        <td class="pr-4">
                            <InputNumber
                                v-model="ramDuration"
                                show-buttons
                                button-layout="horizontal"
                                :min="15"
                                :max="600"
                                :step="15"
                                suffix=" s"
                                class="w-32"
                                :disabled="ramActive"
                                :input-style="{ width: '3.5rem' }"
                                input-class="!p-1.5 !text-sm"
                            >
                                <template #incrementicon>
                                    <span class="pi pi-plus" />
                                </template>
                                <template #decrementicon>
                                    <span class="pi pi-minus" />
                                </template>
                            </InputNumber>
                        </td>
                        <td class="pr-4">
                            <Button
                                v-if="!ramActive"
                                :label="t('views.appInfo.start')"
                                class="bg-accent/80 hover:!bg-accent h-[2.375rem]"
                                :disabled="cpuActive"
                                @click="startRamStress"
                            />
                            <Button
                                v-else
                                :label="t('views.appInfo.stop')"
                                class="bg-red-600/80 hover:!bg-red-600 h-[2.375rem]"
                                @click="stopRamStress"
                            />
                        </td>
                        <td>
                            <div class="flex items-center gap-2">
                                <svg-icon
                                    type="mdi"
                                    :class="
                                        ramActive ? 'text-success' : 'text-text-color-secondary'
                                    "
                                    :path="mdiCircle"
                                    :size="deviceStore.getREMSize(0.75)"
                                />
                                <span class="text-sm">{{
                                    ramActive
                                        ? t('views.appInfo.active')
                                        : t('views.appInfo.inactive')
                                }}</span>
                                <stress-backend-select
                                    v-if="stressNgAvailable && !ramActive"
                                    v-model="settingsStore.ramStressBackend"
                                    class="ml-1 stress-backend-select"
                                />
                                <span
                                    v-else
                                    class="text-xs text-text-color-secondary ml-1 opacity-70"
                                    >[{{ backendLabel(ramBackend) }}]</span
                                >
                            </div>
                        </td>
                    </tr>
                    <!-- Drive Stress -->
                    <tr>
                        <td class="pr-4">
                            <stress-test-label
                                :label="t('views.appInfo.driveStress')"
                                :tooltip="t('views.appInfo.driveStressTooltip')"
                            />
                        </td>
                        <td class="pr-4">
                            <div class="flex items-center gap-2">
                                <InputNumber
                                    v-model="driveDuration"
                                    show-buttons
                                    button-layout="horizontal"
                                    :min="15"
                                    :max="600"
                                    :step="15"
                                    suffix=" s"
                                    class="w-32"
                                    :disabled="driveActive"
                                    :input-style="{ width: '3.5rem' }"
                                    input-class="!p-1.5 !text-sm"
                                >
                                    <template #incrementicon>
                                        <span class="pi pi-plus" />
                                    </template>
                                    <template #decrementicon>
                                        <span class="pi pi-minus" />
                                    </template>
                                </InputNumber>
                                <Select
                                    v-model="selectedDrive"
                                    :options="availableDrives"
                                    option-value="device_path"
                                    :option-label="driveLabel"
                                    :placeholder="t('views.appInfo.selectDrive')"
                                    class="w-64"
                                    :disabled="driveActive || availableDrives.length === 0"
                                />
                            </div>
                        </td>
                        <td class="pr-4">
                            <Button
                                v-if="!driveActive"
                                :label="t('views.appInfo.start')"
                                class="bg-accent/80 hover:!bg-accent h-[2.375rem]"
                                :disabled="!selectedDrive || availableDrives.length === 0"
                                @click="startDriveStress"
                            />
                            <Button
                                v-else
                                :label="t('views.appInfo.stop')"
                                class="bg-red-600/80 hover:!bg-red-600 h-[2.375rem]"
                                @click="stopDriveStress"
                            />
                        </td>
                        <td>
                            <div class="flex items-center gap-2">
                                <svg-icon
                                    type="mdi"
                                    :class="
                                        driveActive ? 'text-success' : 'text-text-color-secondary'
                                    "
                                    :path="mdiCircle"
                                    :size="deviceStore.getREMSize(0.75)"
                                />
                                <span class="text-sm">{{
                                    driveActive
                                        ? t('views.appInfo.active')
                                        : t('views.appInfo.inactive')
                                }}</span>
                                <stress-backend-select
                                    v-if="stressNgAvailable && !driveActive"
                                    v-model="settingsStore.driveStressBackend"
                                    class="ml-1 stress-backend-select"
                                />
                                <span
                                    v-else
                                    class="text-xs text-text-color-secondary ml-1 opacity-70"
                                    >[{{ backendLabel(driveBackend) }}]</span
                                >
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
