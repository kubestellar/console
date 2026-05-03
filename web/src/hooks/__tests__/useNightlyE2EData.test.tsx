/**
 * Tests for useNightlyE2EData — verifies the hook passes correct
 * config to useCache (key, demoData shape, initialData from localStorage).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const lastCacheArgs: { current: Record<string, unknown> | null } = { current: null }

vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (args: Record<string, unknown>) => {
    lastCacheArgs.current = args
    return {
      data: args.demoData,
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: true,
      error: null,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: vi.fn(),
    }
  },
}))
vi.mock('../../lib/llmd/nightlyE2EDemoData', () => ({
    createCachedHook: vi.fn(),
  generateDemoNightlyData: () => [{ guide: 'demo', acronym: 'DM', platform: 'test', runs: [] }],
}))
vi.mock('../../lib/demoMode', () => ({
    createCachedHook: vi.fn(),
  isNetlifyDeployment: false,
}))
vi.mock('../../lib/constants', () => ({
    createCachedHook: vi.fn(),
  STORAGE_KEY_TOKEN: 'token',
}))
vi.mock('../../lib/constants/network', () => ({
    createCachedHook: vi.fn(),
  FETCH_DEFAULT_TIMEOUT_MS: 30000,
}))

describe('useNightlyE2EData', () => {
  beforeEach(() => {
    localStorage.clear()
    lastCacheArgs.current = null
  })

  it('passes correct cache key and demo data shape', async () => {
    vi.resetModules()
    const { useNightlyE2EData } = await import('../useNightlyE2EData')
    renderHook(() => useNightlyE2EData())

    expect(lastCacheArgs.current).not.toBeNull()
    expect(lastCacheArgs.current?.key).toBe('nightly-e2e-status')
    const demo = lastCacheArgs.current?.demoData as { isDemo: boolean; guides: unknown[] }
    expect(demo.isDemo).toBe(true)
    expect(demo.guides.length).toBeGreaterThan(0)
  })

  it('reads initialData from localStorage when valid data cached', async () => {
    const cached = {
      guides: [{ guide: 'cached', acronym: 'C', platform: 'ocp', runs: [] }],
      isDemo: false,
    }
    localStorage.setItem('nightly-e2e-cache', JSON.stringify(cached))

    vi.resetModules()
    const { useNightlyE2EData } = await import('../useNightlyE2EData')
    renderHook(() => useNightlyE2EData())

    const init = lastCacheArgs.current?.initialData as { guides: unknown[]; isDemo: boolean }
    expect(init.guides.length).toBe(1)
    expect(init.isDemo).toBe(false)
  })

  it('returns empty guides when localStorage is malformed', async () => {
    localStorage.setItem('nightly-e2e-cache', 'not json')

    vi.resetModules()
    const { useNightlyE2EData } = await import('../useNightlyE2EData')
    renderHook(() => useNightlyE2EData())

    const init = lastCacheArgs.current?.initialData as { guides: unknown[] }
    expect(init.guides).toEqual([])
  })

  it('returns empty guides when cached data has isDemo=true', async () => {
    // Demo-flagged cache should be ignored on next load
    localStorage.setItem('nightly-e2e-cache', JSON.stringify({
      guides: [{ guide: 'demo' }],
      isDemo: true,
    }))

    vi.resetModules()
    const { useNightlyE2EData } = await import('../useNightlyE2EData')
    renderHook(() => useNightlyE2EData())

    const init = lastCacheArgs.current?.initialData as { guides: unknown[] }
    expect(init.guides).toEqual([])
  })
})
