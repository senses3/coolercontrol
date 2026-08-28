// SPDX-FileCopyrightText: 2026 Guy Boldon and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Node 26 exposes `localStorage` as a built-in global that stays undefined
 * unless the process was started with `--localstorage-file`. Vitest's jsdom
 * window *is* globalThis, so that getter shadows jsdom's own storage: every
 * module-level `localStorage` read then fails while the test file is being
 * collected, which takes the whole file down rather than one test.
 *
 * Install a spec-shaped storage when the global is missing. On Node 22 jsdom's
 * storage is intact and this does nothing. `Storage` is replaced alongside it
 * so `vi.spyOn(Storage.prototype, ...)` still intercepts calls, which the
 * recents tests rely on to simulate a storage that refuses to write.
 */

class MemoryStorage {
    private items = new Map<string, string>()

    get length(): number {
        return this.items.size
    }

    clear(): void {
        this.items.clear()
    }

    getItem(key: string): string | null {
        return this.items.get(String(key)) ?? null
    }

    key(index: number): string | null {
        return [...this.items.keys()][index] ?? null
    }

    removeItem(key: string): void {
        this.items.delete(String(key))
    }

    setItem(key: string, value: string): void {
        this.items.set(String(key), String(value))
    }
}

const globals = globalThis as unknown as Record<string, unknown>

if (globals.localStorage == null) {
    globals.Storage = MemoryStorage
    globals.localStorage = new MemoryStorage()
    // Node's own sessionStorage is process-wide, so replace it too: tests that
    // clear one and not the other would otherwise leak state between files.
    globals.sessionStorage = new MemoryStorage()
}
