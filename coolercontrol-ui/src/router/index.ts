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

import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
// @ts-ignore
import ShellLayout from '@/shell/ShellLayout.vue'

// Shell section routes. Placeholder pages until each section's phase lands;
// the settings section reuses the existing settings route.
const sectionRoutes: RouteRecordRaw[] = [
    {
        path: 'home',
        name: 'section-home',
        component: () => import('@/shell/SectionPage.vue'),
        props: { sectionId: 'home' },
        meta: { section: 'home' },
    },
    {
        path: 'cooling',
        name: 'section-cooling',
        component: () => import('@/shell/cooling/CoolingLanding.vue'),
        meta: { section: 'cooling' },
    },
    {
        path: 'cooling/modes',
        name: 'cooling-modes',
        component: () => import('@/shell/cooling/ModesPage.vue'),
        meta: { section: 'cooling' },
    },
    {
        path: 'cooling/:deviceUID/:channelName',
        name: 'cooling-channel',
        component: () => import('@/shell/cooling/ChannelPage.vue'),
        props: true,
        meta: { section: 'cooling' },
    },
    {
        path: 'monitoring',
        name: 'section-monitoring',
        component: () => import('@/shell/SectionPage.vue'),
        props: { sectionId: 'monitoring' },
        meta: { section: 'monitoring' },
    },
    {
        path: 'devices',
        name: 'section-devices',
        component: () => import('@/shell/SectionPage.vue'),
        props: { sectionId: 'devices' },
        meta: { section: 'devices' },
    },
]

const router = createRouter({
    // For our use case, using the hash history allows users to bookmark links
    // without the daemon needing a catch-all rule. The only downside is that
    // it adds an extra # in the URL, which is bad for SEO, but that is not
    // a concern for us.
    history: createWebHashHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/',
            component: ShellLayout,
            children: [
                ...sectionRoutes,
                {
                    path: '',
                    name: 'startup-page',
                    redirect: { name: 'section-home' },
                },
                // Legacy route names kept as redirects: wizards, bookmarks,
                // and the Qt app navigate by these.
                {
                    path: 'controls',
                    name: 'system-controls',
                    redirect: { name: 'section-cooling' },
                },
                {
                    path: 'controls/:deviceUID/:channelName',
                    name: 'channel-control-flow',
                    redirect: (to) => ({
                        name: 'cooling-channel',
                        params: {
                            deviceUID: to.params.deviceUID,
                            channelName: to.params.channelName,
                        },
                    }),
                },
                {
                    path: 'app-info',
                    name: 'app-info',
                    component: () => import('@/views/AppInfoView.vue'),
                    props: false,
                },
                {
                    path: '/settings/:tabNumber?',
                    name: 'settings',
                    component: () => import('@/layout/AppSettings.vue'),
                    props: true,
                    meta: { section: 'settings' },
                },
                {
                    path: '/dashboards/:dashboardUID?',
                    name: 'dashboards',
                    component: () => import('@/views/DashboardView.vue'),
                    props: true,
                },
                {
                    path: '/modes/:modeUID',
                    name: 'modes',
                    component: () => import('@/views/ModeView.vue'),
                    props: true,
                },
                {
                    path: '/profiles/:profileUID',
                    name: 'profiles',
                    component: () => import('@/views/ProfileView.vue'),
                    props: true,
                },
                {
                    path: '/functions/:functionUID',
                    name: 'functions',
                    component: () => import('@/views/FunctionView.vue'),
                    props: true,
                },
                {
                    path: '/alerts/:alertUID?',
                    name: 'alerts',
                    component: () => import('@/views/AlertView.vue'),
                    props: true,
                },
                {
                    path: '/alerts-overview',
                    name: 'alerts-overview',
                    component: () => import('@/views/AlertsOverView.vue'),
                    props: true,
                },
                {
                    path: '/custom-sensors/:customSensorID?',
                    name: 'custom-sensors',
                    component: () => import('@/views/CustomSensorView.vue'),
                    props: true,
                },
                {
                    path: '/dashboards/:deviceUID/:channelName',
                    name: 'single-dashboard',
                    component: () => import('@/views/SingleDashboardView.vue'),
                    props: true,
                },
                {
                    path: '/devices/:deviceUID/speed/:channelName',
                    name: 'device-speed',
                    redirect: (to) => ({
                        name: 'cooling-channel',
                        params: {
                            deviceUID: to.params.deviceUID,
                            channelName: to.params.channelName,
                        },
                    }),
                },
                {
                    path: '/devices/:deviceId/lighting/:channelName',
                    name: 'device-lighting',
                    component: () => import('@/views/LightingView.vue'),
                    props: true,
                },
                {
                    path: '/devices/:deviceId/lcd/:channelName',
                    name: 'device-lcd',
                    component: () => import('@/views/LcdView.vue'),
                    props: true,
                },
                {
                    path: '/plugins-overview',
                    name: 'plugins-overview',
                    component: () => import('@/views/PluginsOverView.vue'),
                    meta: { section: 'plugins' },
                },
                {
                    path: '/plugins/:pluginId',
                    name: 'plugin-page',
                    component: () => import('@/views/PluginPageView.vue'),
                    props: true,
                    meta: { section: 'plugins' },
                },
                {
                    path: '/:pathMatch(.*)', // match any other route
                    name: 'not-found',
                    component: () => import('@/components/NotFound.vue'),
                },
            ],
        },
    ],
})

export default router
