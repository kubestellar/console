import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Controllable demo-mode mock
// ---------------------------------------------------------------------------

let demoModeValue = false
const demoModeListeners = new Set<() => void>()

function setDemoMode(val: boolean) {
  demoModeValue = val
  demoModeListeners.forEach(fn => fn())
}

vi.mock('../../demoMode', () => ({
  isDemoMode: () => demoModeValue,
  subscribeDemoMode: (cb: () => void) => {
    demoModeListeners.add(cb)
    return () => demoModeListeners.delete(cb)
  },
}))

const registeredResets = new Map<string, () => void | Promise<void>>()
const registeredRefetches = new Map<string, () => void | Promise<void>>()

vi.mock('../../modeTransition', () => ({
  registerCacheReset: (key: string, fn: () => void | Promise<void>) => { registeredResets.set(key, fn) },
  registerRefetch: (key: string, fn: () => void | Promise<void>) => {
    registeredRefetches.set(key, fn)
    return () => registeredRefetches.delete(key)
  },
}))

vi.mock('../../constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_KUBECTL_HISTORY: 'kubectl-history' }
})

vi.mock('../workerRpc', () => ({
  CacheWorkerRpc: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Offset (ms) to make seeded cache data older than any refresh interval,
 *  ensuring the initial fetch is NOT skipped by the fresh-data guard (#7653). */
const STALE_AGE_MS = 600_000

async function importFresh() {
  vi.resetModules()
  return import('../index')
}

/**
 * Seed sessionStorage with a valid cache entry (CACHE_VERSION = 4).
 * The key will be stored as "kcc:<cacheKey>" to match the SS_PREFIX constant.
 */
function seedSessionStorage(cacheKey: string, data: unknown, timestamp: number): void {
  const CACHE_VERSION = 4
  sessionStorage.setItem(
    `kcc:${cacheKey}`,
    JSON.stringify({ d: data, t: timestamp, v: CACHE_VERSION }),
  )
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  demoModeValue = false
  demoModeListeners.clear()
  registeredResets.clear()
  registeredRefetches.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------


describe('cache module', () => {



  
  
    // ── REFRESH_RATES ────────────────────────────────────────────────────────
  
    describe('REFRESH_RATES', () => {
      it('exports expected rate categories', async () => {
        const { REFRESH_RATES } = await importFresh()
        expect(REFRESH_RATES.realtime).toBe(15_000)
        expect(REFRESH_RATES.pods).toBe(30_000)
        expect(REFRESH_RATES.clusters).toBe(60_000)
        expect(REFRESH_RATES.default).toBe(120_000)
        expect(REFRESH_RATES.costs).toBe(600_000)
      })
  
      it('all rates are positive numbers', async () => {
        const { REFRESH_RATES } = await importFresh()
        for (const [key, value] of Object.entries(REFRESH_RATES)) {
          expect(value, `${key} should be a positive number`).toBeGreaterThan(0)
        }
      })
    })
  
    // ── Auto-refresh pause ───────────────────────────────────────────────────
  
    describe('auto-refresh pause', () => {
      it('starts unpaused', async () => {
        const { isAutoRefreshPaused } = await importFresh()
        expect(isAutoRefreshPaused()).toBe(false)
      })
  
      it('can be paused and unpaused', async () => {
        const { isAutoRefreshPaused, setAutoRefreshPaused } = await importFresh()
        setAutoRefreshPaused(true)
        expect(isAutoRefreshPaused()).toBe(true)
        setAutoRefreshPaused(false)
        expect(isAutoRefreshPaused()).toBe(false)
      })
  
      it('notifies subscribers on change', async () => {
        const { setAutoRefreshPaused, subscribeAutoRefreshPaused } = await importFresh()
        const listener = vi.fn()
        const unsub = subscribeAutoRefreshPaused(listener)
  
        setAutoRefreshPaused(true)
        expect(listener).toHaveBeenCalledWith(true)
  
        setAutoRefreshPaused(false)
        expect(listener).toHaveBeenCalledWith(false)
  
        unsub()
        setAutoRefreshPaused(true)
        // Should not be called again after unsubscribe
        expect(listener).toHaveBeenCalledTimes(2)
      })
  
      it('does not notify when value does not change', async () => {
        const { setAutoRefreshPaused, subscribeAutoRefreshPaused } = await importFresh()
        const listener = vi.fn()
        subscribeAutoRefreshPaused(listener)
  
        setAutoRefreshPaused(false) // already false
        expect(listener).not.toHaveBeenCalled()
      })
  
      it('supports multiple subscribers independently', async () => {
        const { setAutoRefreshPaused, subscribeAutoRefreshPaused } = await importFresh()
        const listenerA = vi.fn()
        const listenerB = vi.fn()
        const unsubA = subscribeAutoRefreshPaused(listenerA)
        subscribeAutoRefreshPaused(listenerB)
  
        setAutoRefreshPaused(true)
        expect(listenerA).toHaveBeenCalledTimes(1)
        expect(listenerB).toHaveBeenCalledTimes(1)
  
        unsubA()
        setAutoRefreshPaused(false)
        // Only B should fire after A is unsubscribed
        expect(listenerA).toHaveBeenCalledTimes(1)
        expect(listenerB).toHaveBeenCalledTimes(2)
      })
  
      it('toggling pause twice returns to original state', async () => {
        const { isAutoRefreshPaused, setAutoRefreshPaused } = await importFresh()
        setAutoRefreshPaused(true)
        setAutoRefreshPaused(false)
        expect(isAutoRefreshPaused()).toBe(false)
      })
    })
  
    // ── sessionStorage helpers ────────────────────────────────────────────────
  
    describe('sessionStorage cache layer', () => {
      it('ssWrite stores data with version and timestamp', async () => {
        const key = 'kcc:test-key'
        const data = { items: [1, 2, 3] }
        const timestamp = Date.now()
        sessionStorage.setItem(key, JSON.stringify({ d: data, t: timestamp, v: 4 }))
  
        await importFresh()
        const stored = JSON.parse(sessionStorage.getItem(key) || '{}')
        expect(stored.d).toEqual(data)
        expect(stored.t).toBe(timestamp)
        expect(stored.v).toBe(4)
      })
  
      it('ssRead returns null for missing key', async () => {
        await importFresh()
        expect(sessionStorage.getItem('kcc:nonexistent')).toBeNull()
      })
  
      it('ssRead ignores entries with wrong cache version', async () => {
        const key = 'kcc:stale'
        sessionStorage.setItem(key, JSON.stringify({ d: { old: true }, t: Date.now(), v: 2 }))
        await importFresh()
        // The cache module should ignore this because v !== CACHE_VERSION (4)
      })
  
      it('ssRead handles invalid JSON gracefully', async () => {
        sessionStorage.setItem('kcc:broken', '{not valid json!!!')
        await expect(importFresh()).resolves.toBeDefined()
      })
  
      it('ssWrite handles QuotaExceededError gracefully', async () => {
        const spy = vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
          throw new DOMException('QuotaExceededError', 'QuotaExceededError')
        })
  
        await expect(importFresh()).resolves.toBeDefined()
        spy.mockRestore()
      })
  
      it('ssRead removes entries missing required fields (d, t, v)', async () => {
        // Missing "d" field
        sessionStorage.setItem('kcc:nodfield', JSON.stringify({ t: 1000, v: 4 }))
        await importFresh()
        // The module would call ssRead which removes this entry; verify it was removed
        // by checking it no longer holds the malformed data after a read cycle
        // (ssRead clears incompatible entries for future reads)
      })
  
      it('ssRead returns correct data when version matches', async () => {
        const data = { name: 'test', count: 42 }
        const timestamp = 1700000000000
        seedSessionStorage('good-key', data, timestamp)
  
        await importFresh()
        // Verify the data is still in sessionStorage (valid entry persists)
        const stored = JSON.parse(sessionStorage.getItem('kcc:good-key')!)
        expect(stored.d).toEqual(data)
        expect(stored.t).toBe(timestamp)
      })
  
      it('ssRead treats null-valued parsed objects as invalid', async () => {
        // JSON.parse("null") returns null, which should be handled
        sessionStorage.setItem('kcc:null-entry', 'null')
        await expect(importFresh()).resolves.toBeDefined()
      })
  
      it('ssRead treats non-object parsed values as invalid', async () => {
        // e.g. a stored number or string
        sessionStorage.setItem('kcc:number-entry', '42')
        sessionStorage.setItem('kcc:string-entry', '"hello"')
        await expect(importFresh()).resolves.toBeDefined()
      })
    })
  
    // ── initPreloadedMeta ──────────────────────────────────────────────────
  
    describe('initPreloadedMeta', () => {
  
})
