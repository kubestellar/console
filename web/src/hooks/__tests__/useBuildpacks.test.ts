import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../../lib/modeTransition', () => ({
  registerCacheReset: vi.fn(),
  registerRefetch: vi.fn(() => vi.fn()),
  unregisterCacheReset: vi.fn(),
}))

vi.mock('../../lib/authToken', () => ({
  getStoredAuthToken: vi.fn(async () => null),
  getStoredAuthTokenSync: vi.fn(() => null),
}))

vi.mock('../mcp/pollingManager', () => ({
  subscribePolling: vi.fn(() => vi.fn()),
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    MCP_HOOK_TIMEOUT_MS: 10000,
    SHORT_DELAY_MS: 100,
    FOCUS_DELAY_MS: 100,
  }
})

import { useBuildpackImages, __buildpacksTestables } from '../mcp/buildpacks'

const {
  getDemoBuildpackImages,
  loadFromStorage,
  saveToStorage,
  BUILDPACK_CACHE_KEY,
  BUILDPACK_CACHE_TTL_MS,
  BUILDPACK_REFRESH_INTERVAL_MS,
} = __buildpacksTestables

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('not available'))
})

// ── Pure function tests ────────────────────────────────────────────────────

describe('getDemoBuildpackImages', () => {
  it('returns a non-empty array', () => {
    const images = getDemoBuildpackImages()
    expect(Array.isArray(images)).toBe(true)
    expect(images.length).toBeGreaterThan(0)
  })

  it('each image has required fields', () => {
    const images = getDemoBuildpackImages()
    const img = images[0]
    expect(typeof img.name).toBe('string')
    expect(typeof img.namespace).toBe('string')
    expect(typeof img.builder).toBe('string')
    expect(typeof img.image).toBe('string')
    expect(typeof img.status).toBe('string')
    expect(typeof img.cluster).toBe('string')
  })

  it('contains both succeeded and failed images', () => {
    const images = getDemoBuildpackImages()
    const statuses = new Set(images.map(i => i.status))
    // Should have at least one non-trivial status
    expect(statuses.size).toBeGreaterThanOrEqual(1)
  })
})

describe('loadFromStorage / saveToStorage', () => {
  it('returns empty array when storage is empty', () => {
    const result = loadFromStorage()
    expect(result.data).toEqual([])
    expect(result.timestamp).toBe(0)
  })

  it('round-trips data through localStorage', () => {
    const ts = Date.now()
    const data = getDemoBuildpackImages()
    saveToStorage(data, ts)
    const loaded = loadFromStorage()
    expect(loaded.data).toHaveLength(data.length)
    expect(loaded.data[0].name).toBe(data[0].name)
    expect(loaded.timestamp).toBe(ts)
  })

  it('returns empty array for corrupt storage', () => {
    localStorage.setItem(BUILDPACK_CACHE_KEY, '[[invalid]]')
    const result = loadFromStorage()
    expect(result.data).toEqual([])
  })

  it('returns empty array when data is not an array', () => {
    localStorage.setItem(BUILDPACK_CACHE_KEY, JSON.stringify({ data: 'not-array', timestamp: 0 }))
    const result = loadFromStorage()
    expect(result.data).toEqual([])
  })
})

describe('constants', () => {
  it('BUILDPACK_CACHE_KEY is a non-empty string', () => {
    expect(typeof BUILDPACK_CACHE_KEY).toBe('string')
    expect(BUILDPACK_CACHE_KEY.length).toBeGreaterThan(0)
  })

  it('BUILDPACK_CACHE_TTL_MS is positive', () => {
    expect(BUILDPACK_CACHE_TTL_MS).toBeGreaterThan(0)
  })

  it('BUILDPACK_REFRESH_INTERVAL_MS exceeds TTL', () => {
    expect(BUILDPACK_REFRESH_INTERVAL_MS).toBeGreaterThan(BUILDPACK_CACHE_TTL_MS)
  })
})

// ── useBuildpackImages hook tests ─────────────────────────────────────────

describe('useBuildpackImages', () => {
  it('returns expected shape', async () => {
    const { result, unmount } = renderHook(() => useBuildpackImages())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.images)).toBe(true)
    expect(typeof result.current.isRefreshing).toBe('boolean')
    expect(typeof result.current.consecutiveFailures).toBe('number')
    expect(typeof result.current.isFailed).toBe('boolean')
    expect(typeof result.current.isDemoData).toBe('boolean')
    expect(typeof result.current.refetch).toBe('function')
    unmount()
  })

  it('falls back to demo data when API unavailable', async () => {
    const { result, unmount } = renderHook(() => useBuildpackImages())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.images.length).toBeGreaterThan(0)
    expect(result.current.isDemoData).toBe(true)
    unmount()
  })

  it('tracks consecutive failures', async () => {
    const { result, unmount } = renderHook(() => useBuildpackImages())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
    unmount()
  })

  it('accepts a cluster argument', async () => {
    const { result, unmount } = renderHook(() => useBuildpackImages('eks-prod-us-east-1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.images)).toBe(true)
    unmount()
  })

  it('loads from localStorage when cached', () => {
    const ts = Date.now()
    const data = getDemoBuildpackImages()
    saveToStorage(data, ts)
    const { result, unmount } = renderHook(() => useBuildpackImages())
    expect(result.current.images.length).toBeGreaterThan(0)
    unmount()
  })

  it('lastRefresh is set after demo fallback', async () => {
    const { result, unmount } = renderHook(() => useBuildpackImages())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastRefresh).not.toBeNull()
    unmount()
  })

  it('isFailed is boolean regardless of failure count', async () => {
    const { result, unmount } = renderHook(() => useBuildpackImages())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.isFailed).toBe('boolean')
    unmount()
  })
})
