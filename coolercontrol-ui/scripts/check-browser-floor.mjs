// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Fails the build when a bundled chunk calls a JavaScript API newer than the browser
// floor and the emitted polyfill bundle does not install it. Such a call only breaks
// on the oldest QtWebEngine we support (Qt 6.2 is Chromium 90), which no test covers.
//
// The floor is read from `modernTargets` in vite.config.mts, the same value
// plugin-legacy uses to pin build.target and pick modern polyfills.
//
// Whether a polyfill is present is answered by running the emitted polyfill bundle with
// those APIs deleted, then seeing which come back. That beats grepping core-js
// internals, whose names and quoting the minifier rewrites.

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const uiDir = fileURLToPath(new URL('..', import.meta.url))
const assetsDir = join(uiDir, 'dist', 'assets')
const viteConfig = join(uiDir, 'vite.config.mts')

// Prototype methods carry no receiver type in minified code, so a hit on `.at(` may
// belong to some unrelated object. That is deliberate: a hit only fails the build when
// the polyfill is also missing, which is the case worth catching. Add a name here when
// a hit is a false positive, with the reason.
const ALLOWLIST = new Set([
    // The uuid package calls it behind a truthiness check and otherwise falls back to
    // crypto.getRandomValues: `!buf && !options && crypto.randomUUID ? ... : v4()`.
    'crypto.randomUUID',
])

// Each entry: the API, where it lives, and the first Chromium that shipped it.
// Only entries above the floor are checked.
const APIS = [
    {
        name: 'Object.hasOwn',
        owner: 'Object',
        key: 'hasOwn',
        chrome: 93,
        match: /\bObject\.hasOwn\s*\(/,
    },
    {
        name: 'Array.prototype.at',
        owner: 'Array.prototype',
        key: 'at',
        chrome: 92,
        match: /\.at\s*\(/,
    },
    {
        name: 'String.prototype.at',
        owner: 'String.prototype',
        key: 'at',
        chrome: 92,
        match: /\.at\s*\(/,
    },
    {
        name: 'Array.prototype.findLast',
        owner: 'Array.prototype',
        key: 'findLast',
        chrome: 97,
        match: /\.findLast\s*\(/,
    },
    {
        name: 'Array.prototype.findLastIndex',
        owner: 'Array.prototype',
        key: 'findLastIndex',
        chrome: 97,
        match: /\.findLastIndex\s*\(/,
    },
    {
        name: 'Array.prototype.toSorted',
        owner: 'Array.prototype',
        key: 'toSorted',
        chrome: 110,
        match: /\.toSorted\s*\(/,
    },
    {
        name: 'Array.prototype.toReversed',
        owner: 'Array.prototype',
        key: 'toReversed',
        chrome: 110,
        match: /\.toReversed\s*\(/,
    },
    {
        name: 'Array.prototype.toSpliced',
        owner: 'Array.prototype',
        key: 'toSpliced',
        chrome: 110,
        match: /\.toSpliced\s*\(/,
    },
    {
        name: 'Object.groupBy',
        owner: 'Object',
        key: 'groupBy',
        chrome: 117,
        match: /\bObject\.groupBy\s*\(/,
    },
    {
        name: 'Map.groupBy',
        owner: 'Map',
        key: 'groupBy',
        chrome: 117,
        match: /\bMap\.groupBy\s*\(/,
    },
    {
        name: 'Promise.withResolvers',
        owner: 'Promise',
        key: 'withResolvers',
        chrome: 119,
        match: /\bPromise\.withResolvers\s*\(/,
    },
    {
        name: 'Array.fromAsync',
        owner: 'Array',
        key: 'fromAsync',
        chrome: 121,
        match: /\bArray\.fromAsync\s*\(/,
    },
    {
        name: 'structuredClone',
        owner: 'globalThis',
        key: 'structuredClone',
        chrome: 98,
        match: /\bstructuredClone\s*\(/,
    },
    // core-js does not polyfill this one, so a hit always needs a manual fallback.
    {
        name: 'crypto.randomUUID',
        owner: 'crypto',
        key: 'randomUUID',
        chrome: 92,
        match: /\bcrypto\.randomUUID\s*\(/,
    },
]

// Syntax cannot be polyfilled. A hit means build.target drifted above the floor.
const SYNTAX = [{ name: 'class static block', chrome: 94, match: /\bstatic\s*\{/ }]

function fail(message) {
    console.error(`browser-floor: ${message}`)
    process.exit(1)
}

function readFloor() {
    if (existsSync(viteConfig).valueOf() === false) fail(`${viteConfig} not found`)
    const config = readFileSync(viteConfig, 'utf8')
    const targets = config.match(/modernTargets:\s*\[([^\]]*)\]/)
    if (targets === null) fail('could not find modernTargets in vite.config.mts')
    const chrome = targets[1].match(/chrome\s*>=\s*(\d+)/)
    if (chrome === null) fail('modernTargets has no chrome floor')
    return Number(chrome[1])
}

// Runs the polyfill bundles with `apis` deleted and reports which ones they restore.
// core-js only installs what it finds missing, so deleting first is what makes the
// answer observable. A child process keeps those deletions away from this one. A vm
// realm would isolate better still, but core-js does not survive its bare globals.
function probePolyfills(files, apis) {
    const program = `
        const fs = require('node:fs')
        // Node lazily loads internals that call the very methods being deleted below
        // (undici pulls node:http, which calls Array.prototype.toSorted). Load them first.
        require('node:http')
        void globalThis.fetch
        const [files, apis] = process.argv.slice(1).map((arg) => JSON.parse(arg))
        const owner = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), globalThis)
        // The method may be inherited (crypto.randomUUID lives on Crypto.prototype), and
        // deleting an inherited key is a silent no-op that would read as "polyfilled".
        const remove = (target, key) => {
            for (let o = target; o != null; o = Object.getPrototypeOf(o)) {
                if (Object.prototype.hasOwnProperty.call(o, key)) {
                    delete o[key]
                    return
                }
            }
        }
        for (const api of apis) {
            const target = owner(api.owner)
            if (target != null) remove(target, api.key)
        }
        for (const file of files) (0, eval)(fs.readFileSync(file, 'utf8'))
        const restored = {}
        for (const api of apis) {
            const target = owner(api.owner)
            restored[api.name] = target != null && typeof target[api.key] === 'function'
        }
        process.stdout.write(JSON.stringify(restored))
    `
    const payload = apis.map(({ name, owner, key }) => ({ name, owner, key }))
    try {
        const out = execFileSync(
            process.execPath,
            ['-e', program, JSON.stringify(files), JSON.stringify(payload)],
            { encoding: 'utf8' },
        )
        return JSON.parse(out)
    } catch (err) {
        fail(`could not evaluate the polyfill bundle: ${err.message.split('\n')[0]}`)
    }
}

const floor = readFloor()
if (existsSync(assetsDir).valueOf() === false) {
    fail(`${assetsDir} not found. Run \`npm run build\` first.`)
}

const chunks = readdirSync(assetsDir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ file, source: readFileSync(join(assetsDir, file), 'utf8') }))
const polyfills = chunks.filter((c) => basename(c.file).startsWith('polyfills-'))
const app = chunks.filter((c) => polyfills.includes(c) === false)
if (chunks.length === 0) fail(`no JavaScript chunks in ${assetsDir}`)
if (polyfills.length === 0) fail('no polyfill chunk was emitted, so nothing backfills the floor')

// An API matters only when it is above the floor and something outside the polyfill
// bundle actually calls it. The polyfill bundle references APIs it implements.
const used = APIS.filter((api) => api.chrome > floor && ALLOWLIST.has(api.name) === false)
    .map((api) => ({ api, files: app.filter((c) => api.match.test(c.source)).map((c) => c.file) }))
    .filter(({ files }) => files.length > 0)

const restored =
    used.length > 0
        ? probePolyfills(
              polyfills.map((c) => join(assetsDir, c.file)),
              used.map((u) => u.api),
          )
        : {}
const unpolyfilled = used.filter(({ api }) => restored[api.name] !== true)

const badSyntax = SYNTAX.filter((s) => s.chrome > floor).flatMap((s) =>
    app.filter((c) => s.match.test(c.source)).map((c) => ({ syntax: s, file: c.file })),
)

if (unpolyfilled.length > 0 || badSyntax.length > 0) {
    console.error(`browser-floor: emitted assets are not safe for chrome ${floor}\n`)
    for (const { api, files } of unpolyfilled) {
        console.error(`  ${api.name} (chrome ${api.chrome}) is called but never polyfilled`)
        for (const file of files) console.error(`      ${file}`)
    }
    for (const { syntax, file } of badSyntax) {
        console.error(`  ${syntax.name} (chrome ${syntax.chrome}) cannot be polyfilled: ${file}`)
    }
    console.error(
        '\n  Fix by giving the dependency a guarded fallback, or by widening modernPolyfills\n' +
            '  in vite.config.mts so the polyfill bundle covers it.',
    )
    process.exit(1)
}

const checked = used.map(({ api }) => api.name).join(', ')
console.log(
    `browser-floor: chrome ${floor} floor holds across ${app.length} chunk(s)` +
        (checked.length > 0 ? `; polyfilled: ${checked}` : ''),
)
