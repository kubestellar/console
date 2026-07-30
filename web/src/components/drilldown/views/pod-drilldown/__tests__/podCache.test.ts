import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  RAPID_REOPEN_THRESHOLD_MS,
  cleanupPodCache,
  getPodCache,
  setPodCache,
} from '../podCache'

// The cache is a module-level Map. Each test clears it up-front to isolate.
function clearAll() {
  // Use a far-future "now" to force cleanupPodCache() to drop every entry.
  vi.setSystemTime(new Date(2100, 0, 1))
  cleanupPodCache()
  vi.useRealTimers()
}

beforeEach(() => {
  vi.useFakeTimers()
  clearAll()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('constants', () => {
  it('RAPID_REOPEN_THRESHOLD_MS is 10 seconds', () => {
    expect(RAPID_REOPEN_THRESHOLD_MS).toBe(10_000)
  })
})

describe('setPodCache / getPodCache', () => {
  it('returns undefined for a key that has never been written', () => {
    expect(getPodCache('c', 'n', 'p')).toBeUndefined()
  })

  it('round-trips a value under the (cluster, namespace, pod) composite key', () => {
    setPodCache('c1', 'ns1', 'pod-a', { lastOpened: 1_700_000_000_000, openCount: 3 })
    expect(getPodCache('c1', 'ns1', 'pod-a')).toEqual({ lastOpened: 1_700_000_000_000, openCount: 3 })
  })

  it('isolates entries by cluster, namespace, and pod name', () => {
    setPodCache('c1', 'ns', 'p', { openCount: 1 })
    setPodCache('c2', 'ns', 'p', { openCount: 2 })
    setPodCache('c1', 'other', 'p', { openCount: 3 })
    setPodCache('c1', 'ns', 'other', { openCount: 4 })
    expect(getPodCache('c1', 'ns', 'p')?.openCount).toBe(1)
    expect(getPodCache('c2', 'ns', 'p')?.openCount).toBe(2)
    expect(getPodCache('c1', 'other', 'p')?.openCount).toBe(3)
    expect(getPodCache('c1', 'ns', 'other')?.openCount).toBe(4)
  })

  it('merges partial updates into the existing entry rather than replacing it', () => {
    setPodCache('c', 'n', 'p', { lastOpened: 1, openCount: 5 })
    setPodCache('c', 'n', 'p', { openCount: 6 })
    const entry = getPodCache('c', 'n', 'p')
    expect(entry?.openCount).toBe(6)
    expect(entry?.lastOpened).toBe(1)
  })

  it('seeds new entries with a lastOpened defaulted to the current time', () => {
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0))
    const now = Date.now()
    setPodCache('c', 'n', 'p', { openCount: 1 })
    const entry = getPodCache('c', 'n', 'p')
    expect(entry?.lastOpened).toBe(now)
    expect(entry?.openCount).toBe(1)
  })

  it('seeds new entries with openCount defaulted to 0 when caller does not set it', () => {
    setPodCache('c', 'n', 'p', { lastOpened: 42 })
    expect(getPodCache('c', 'n', 'p')).toEqual({ lastOpened: 42, openCount: 0 })
  })
})

describe('cleanupPodCache', () => {
  it('drops entries whose lastOpened is older than 5 minutes', () => {
    // Freeze the initial "write" time.
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0))
    setPodCache('c', 'n', 'old', { lastOpened: Date.now(), openCount: 1 })

    // Advance the clock past the 5-minute TTL, then write a fresh entry.
    vi.setSystemTime(new Date(2026, 0, 1, 12, 4, 59))
    setPodCache('c', 'n', 'fresh', { lastOpened: Date.now(), openCount: 1 })

    // Move past the TTL for the "old" entry only.
    vi.setSystemTime(new Date(2026, 0, 1, 12, 5, 1))
    cleanupPodCache()

    expect(getPodCache('c', 'n', 'old')).toBeUndefined()
    expect(getPodCache('c', 'n', 'fresh')).toBeDefined()
  })

  it('keeps entries whose lastOpened is exactly 5 minutes ago (boundary)', () => {
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0))
    const t0 = Date.now()
    setPodCache('c', 'n', 'edge', { lastOpened: t0, openCount: 1 })

    vi.setSystemTime(new Date(t0 + 5 * 60 * 1000))
    cleanupPodCache()

    expect(getPodCache('c', 'n', 'edge')).toBeDefined()
  })

  it('is a no-op when the cache is empty', () => {
    expect(() => cleanupPodCache()).not.toThrow()
  })
})
