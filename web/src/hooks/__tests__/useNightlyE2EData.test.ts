import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — only dependencies, never the hook under test
// ---------------------------------------------------------------------------

const mockUseCache = vi.fn()

vi.mock('../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../../lib/demoMode', () => ({
  isNetlifyDeployment: false,
  isDemoMode: () => true,
  getDemoMode: () => true,
}))

vi.mock('../../lib/llmd/nightlyE2EDemoData', () => ({
  generateDemoNightlyData: () => [
    {
      guide: 'Demo Guide',
      acronym: 'DG',
      platform: 'kubernetes',
      repo: 'example/repo',
      workflowFile: 'nightly.yml',
      runs: [],
      passRate: 100,
      trend: 'stable',
      latestConclusion: 'success',
      model: 'test-model',
      gpuType: 'A100',
      gpuCount: 4,
    },
  ],
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'token' }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, FETCH_DEFAULT_TIMEOUT_MS: 10000 }
})

import { useNightlyE2EData } from '../useNightlyE2EData'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultCacheResult(overrides: Record<string, unknown> = {}) {
  return {
    data: { guides: [], isDemo: true },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: true,
    isFailed: false,
    consecutiveFailures: 0,
    refetch: vi.fn(),
    ...overrides,
  }
}

function makeGuide(overrides: Record<string, unknown> = {}) {
  return {
    guide: 'Test Guide',
    acronym: 'TG',
    platform: 'kubernetes',
    repo: 'example/repo',
    workflowFile: 'nightly.yml',
    runs: [],
    passRate: 100,
    trend: 'stable',
    latestConclusion: 'success',
    model: 'test-model',
    gpuType: 'A100',
    gpuCount: 4,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockUseCache.mockReturnValue(defaultCacheResult())
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useNightlyE2EData', () => {
  it('returns expected shape with all properties', () => {
    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current).toHaveProperty('guides')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('refetch')
  })

  it('does not throw on mount', () => {
    expect(() => renderHook(() => useNightlyE2EData())).not.toThrow()
  })

  it('returns isDemoFallback=true when cache returns demo data', () => {
    mockUseCache.mockReturnValue(
      defaultCacheResult({
        data: { guides: [], isDemo: true },
        isDemoFallback: true,
      }),
    )

    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.isDemoFallback).toBe(true)
  })

  it('returns isDemoFallback=false when cache returns live data', () => {
    mockUseCache.mockReturnValue(
      defaultCacheResult({
        data: { guides: [makeGuide()], isDemo: false },
        isDemoFallback: false,
      }),
    )

    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.isDemoFallback).toBe(false)
  })

  it('returns isDemoFallback=true when not loading and isDemo is true in data', () => {
    mockUseCache.mockReturnValue(
      defaultCacheResult({
        data: { guides: [makeGuide()], isDemo: true },
        isDemoFallback: false,
        isLoading: false,
      }),
    )

    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.isDemoFallback).toBe(true)
  })

  it('returns guides from cache data', () => {
    const guides = [makeGuide({ guide: 'Guide A' }), makeGuide({ guide: 'Guide B' })]
    mockUseCache.mockReturnValue(
      defaultCacheResult({ data: { guides, isDemo: false } }),
    )

    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.guides).toHaveLength(2)
    expect(result.current.guides[0].guide).toBe('Guide A')
    expect(result.current.guides[1].guide).toBe('Guide B')
  })

  it('returns empty guides when cache has no guides', () => {
    mockUseCache.mockReturnValue(
      defaultCacheResult({ data: { guides: [], isDemo: true } }),
    )

    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.guides).toEqual([])
  })

  it('reports isLoading=true when cache is loading and no cached initial', () => {
    mockUseCache.mockReturnValue(defaultCacheResult({ isLoading: true }))

    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.isLoading).toBe(true)
  })

  it('reports isLoading=false when cache is done loading', () => {
    mockUseCache.mockReturnValue(defaultCacheResult({ isLoading: false }))

    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.isLoading).toBe(false)
  })

  it('reports isRefreshing from cache result', () => {
    mockUseCache.mockReturnValue(defaultCacheResult({ isRefreshing: true }))

    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.isRefreshing).toBe(true)
  })

  it('reports isFailed from cache result', () => {
    mockUseCache.mockReturnValue(
      defaultCacheResult({ isFailed: true, consecutiveFailures: 5 }),
    )

    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.isFailed).toBe(true)
    expect(result.current.consecutiveFailures).toBe(5)
  })

  it('reports consecutiveFailures=0 on success', () => {
    mockUseCache.mockReturnValue(defaultCacheResult({ consecutiveFailures: 0 }))

    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.consecutiveFailures).toBe(0)
  })

  it('exposes refetch from cache', () => {
    const refetchFn = vi.fn()
    mockUseCache.mockReturnValue(defaultCacheResult({ refetch: refetchFn }))

    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.refetch).toBe(refetchFn)
  })

  it('passes correct key and category to useCache', () => {
    renderHook(() => useNightlyE2EData())
    expect(mockUseCache).toHaveBeenCalled()
    const opts = mockUseCache.mock.calls[0][0]
    expect(opts.key).toBe('nightly-e2e-status')
    expect(opts.category).toBe('default')
  })

  it('passes persist=true to useCache', () => {
    renderHook(() => useNightlyE2EData())
    const opts = mockUseCache.mock.calls[0][0]
    expect(opts.persist).toBe(true)
  })

  it('passes demoWhenEmpty=true to useCache', () => {
    renderHook(() => useNightlyE2EData())
    const opts = mockUseCache.mock.calls[0][0]
    expect(opts.demoWhenEmpty).toBe(true)
  })

  it('passes demoData with isDemo=true to useCache', () => {
    renderHook(() => useNightlyE2EData())
    const opts = mockUseCache.mock.calls[0][0]
    expect(opts.demoData.isDemo).toBe(true)
    expect(Array.isArray(opts.demoData.guides)).toBe(true)
  })

  it('provides a fetcher function to useCache', () => {
    renderHook(() => useNightlyE2EData())
    const opts = mockUseCache.mock.calls[0][0]
    expect(typeof opts.fetcher).toBe('function')
  })

  it('uses idle refresh interval when no running jobs', () => {
    const REFRESH_IDLE_MS = 300_000 // 5 minutes
    mockUseCache.mockReturnValue(
      defaultCacheResult({
        data: {
          guides: [makeGuide({ runs: [{ status: 'completed' }] })],
          isDemo: false,
        },
      }),
    )

    renderHook(() => useNightlyE2EData())
    const opts = mockUseCache.mock.calls[0][0]
    expect(opts.refreshInterval).toBe(REFRESH_IDLE_MS)
  })

  it('switches to active refresh interval when running jobs are detected', async () => {
    const REFRESH_ACTIVE_MS = 120_000 // 2 minutes
    const runningGuide = makeGuide({
      runs: [
        {
          status: 'in_progress',
          id: 1,
          conclusion: null,
          createdAt: '',
          updatedAt: '',
          htmlUrl: '',
          runNumber: 1,
        },
      ],
    })

    mockUseCache.mockReturnValue(
      defaultCacheResult({
        data: { guides: [runningGuide], isDemo: false },
      }),
    )

    renderHook(() => useNightlyE2EData())

    // After the effect detects running jobs, useCache will be called again
    // with the active interval on the next render
    await waitFor(() => {
      const lastCall = mockUseCache.mock.calls[mockUseCache.mock.calls.length - 1]
      return lastCall?.[0]?.refreshInterval === REFRESH_ACTIVE_MS
    })
  })
})
