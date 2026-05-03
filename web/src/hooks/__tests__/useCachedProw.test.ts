import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ============================================================================
// Mocks
// ============================================================================

const mockUseCache = vi.fn()

vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

const mockExec = vi.fn()
vi.mock('../../lib/kubectlProxy', () => ({
    createCachedHook: vi.fn(),
  kubectlProxy: { exec: (...args: unknown[]) => mockExec(...args) },
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, KUBECTL_EXTENDED_TIMEOUT_MS: 30000 }
})

import { useCachedProwJobs, fetchProwJobs, formatTimeAgo } from '../useCachedProw'

// ============================================================================
// Helpers
// ============================================================================

/** Default mock return value for useCache simulating a "loaded, no data" state */
function makeCacheResult(overrides: Record<string, unknown> = {}) {
  return {
    data: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

/** Build a minimal ProwJobResource for kubectl JSON output */
function makeProwJobResource(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString()
  return {
    metadata: {
      name: overrides.name ?? 'pj-1',
      creationTimestamp: now,
      labels: {
        'prow.k8s.io/job': overrides.job ?? 'pull-e2e',
        'prow.k8s.io/type': overrides.type ?? 'presubmit',
      },
    },
    spec: {
      job: overrides.job ?? 'pull-e2e',
      type: overrides.type ?? 'presubmit',
      cluster: 'prow',
    },
    status: {
      state: overrides.state ?? 'success',
      startTime: (overrides.startTime as string) ?? now,
      completionTime: overrides.completionTime,
    },
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('useCachedProwJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue(makeCacheResult())
  })

  // ---------- Shape & Defaults ----------

  it('returns the expected return shape', () => {
    const { result } = renderHook(() => useCachedProwJobs())
    expect(result.current).toHaveProperty('jobs')
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('status')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
    expect(result.current).toHaveProperty('formatTimeAgo')
  })

  it('returns empty jobs array when cache has no data', () => {
    const { result } = renderHook(() => useCachedProwJobs())
    expect(result.current.jobs).toEqual([])
    expect(result.current.data).toEqual([])
  })

  it('jobs and data reference the same array', () => {
    const jobs = [{ id: '1', name: 'job', type: 'presubmit', state: 'success', cluster: 'prow', startTime: new Date().toISOString(), duration: '5m' }]
    mockUseCache.mockReturnValue(makeCacheResult({ data: jobs }))

    const { result } = renderHook(() => useCachedProwJobs())
    expect(result.current.jobs).toBe(result.current.data)
  })

  // ---------- Cache Configuration ----------

  it('passes the correct cache key based on cluster and namespace', () => {
    renderHook(() => useCachedProwJobs('my-cluster', 'ci-ns'))
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'prowjobs:my-cluster:ci-ns' })
    )
  })

  it('uses default cluster=prow and namespace=prow', () => {
    renderHook(() => useCachedProwJobs())
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'prowjobs:prow:prow' })
    )
  })

  it('configures cache with gitops category', () => {
    renderHook(() => useCachedProwJobs())
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'gitops' })
    )
  })

  it('provides demo data to the cache', () => {
    renderHook(() => useCachedProwJobs())
    const cacheConfig = mockUseCache.mock.calls[0][0]
    expect(Array.isArray(cacheConfig.demoData)).toBe(true)
    expect(cacheConfig.demoData.length).toBeGreaterThan(0)
  })

  it('provides a fetcher function to the cache', () => {
    renderHook(() => useCachedProwJobs())
    const cacheConfig = mockUseCache.mock.calls[0][0]
    expect(typeof cacheConfig.fetcher).toBe('function')
  })

  // ---------- Status Computation ----------

  it('computes status.healthy=true when consecutiveFailures < 3', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ consecutiveFailures: 2 }))
    const { result } = renderHook(() => useCachedProwJobs())
    expect(result.current.status.healthy).toBe(true)
  })

  it('computes status.healthy=false when consecutiveFailures >= 3', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ consecutiveFailures: 3 }))
    const { result } = renderHook(() => useCachedProwJobs())
    expect(result.current.status.healthy).toBe(false)
  })

  it('computes successRate from recent jobs within the last hour', () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString()
    const jobs = [
      { id: '1', name: 'a', type: 'presubmit', state: 'success', cluster: 'prow', startTime: tenMinAgo, duration: '5m' },
      { id: '2', name: 'b', type: 'presubmit', state: 'success', cluster: 'prow', startTime: tenMinAgo, duration: '5m' },
      { id: '3', name: 'c', type: 'presubmit', state: 'failure', cluster: 'prow', startTime: tenMinAgo, duration: '5m' },
      { id: '4', name: 'd', type: 'presubmit', state: 'error', cluster: 'prow', startTime: tenMinAgo, duration: '5m' },
    ]
    mockUseCache.mockReturnValue(makeCacheResult({ data: jobs }))
    const { result } = renderHook(() => useCachedProwJobs())
    // 2 success / (2 success + 1 failure + 1 error) = 50%
    expect(result.current.status.successRate).toBe(50)
  })

  it('returns 100% successRate when no completed jobs exist', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ data: [] }))
    const { result } = renderHook(() => useCachedProwJobs())
    expect(result.current.status.successRate).toBe(100)
  })

  it('counts pending and running jobs in status', () => {
    const now = new Date().toISOString()
    const jobs = [
      { id: '1', name: 'p1', type: 'presubmit', state: 'pending', cluster: 'prow', startTime: now, duration: '-' },
      { id: '2', name: 'p2', type: 'presubmit', state: 'triggered', cluster: 'prow', startTime: now, duration: '-' },
      { id: '3', name: 'r1', type: 'presubmit', state: 'running', cluster: 'prow', startTime: now, duration: '1m' },
    ]
    mockUseCache.mockReturnValue(makeCacheResult({ data: jobs }))
    const { result } = renderHook(() => useCachedProwJobs())
    expect(result.current.status.pendingJobs).toBe(2)
    expect(result.current.status.runningJobs).toBe(1)
  })

  it('excludes old jobs from prowJobsLastHour count', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString()
    const jobs = [
      { id: '1', name: 'old', type: 'periodic', state: 'success', cluster: 'prow', startTime: twoHoursAgo, duration: '5m' },
    ]
    mockUseCache.mockReturnValue(makeCacheResult({ data: jobs }))
    const { result } = renderHook(() => useCachedProwJobs())
    expect(result.current.status.prowJobsLastHour).toBe(0)
  })

  // ---------- Demo Fallback ----------

  it('reflects isDemoFallback from cache', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ isDemoFallback: true }))
    const { result } = renderHook(() => useCachedProwJobs())
    expect(result.current.isDemoFallback).toBe(true)
  })

  // ---------- Error / Loading Passthrough ----------

  it('passes through isLoading from cache', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ isLoading: true }))
    const { result } = renderHook(() => useCachedProwJobs())
    expect(result.current.isLoading).toBe(true)
  })

  it('passes through error from cache', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ error: 'kaboom' }))
    const { result } = renderHook(() => useCachedProwJobs())
    expect(result.current.error).toBe('kaboom')
  })

  it('passes through isFailed from cache', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ isFailed: true }))
    const { result } = renderHook(() => useCachedProwJobs())
    expect(result.current.isFailed).toBe(true)
  })

  it('passes through refetch from cache', () => {
    const mockRefetch = vi.fn()
    mockUseCache.mockReturnValue(makeCacheResult({ refetch: mockRefetch }))
    const { result } = renderHook(() => useCachedProwJobs())
    expect(result.current.refetch).toBe(mockRefetch)
  })
})

// ============================================================================
// fetchProwJobs (standalone)
// ============================================================================

describe('fetchProwJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls kubectlProxy with correct args and returns parsed jobs', async () => {
    const resource = makeProwJobResource({ name: 'pj-test', state: 'success' })
    mockExec.mockResolvedValue({
      exitCode: 0,
      output: JSON.stringify({ items: [resource] }),
      error: '',
    })

    const jobs = await fetchProwJobs('prow', 'prow')
    expect(jobs).toHaveLength(1)
    expect(jobs[0].id).toBe('pj-test')
    expect(mockExec).toHaveBeenCalledWith(
      ['get', 'prowjobs', '-n', 'prow', '-o', 'json', '--sort-by=.metadata.creationTimestamp'],
      expect.objectContaining({ context: 'prow' })
    )
  })

  it('throws on non-zero exit code', async () => {
    mockExec.mockResolvedValue({ exitCode: 1, output: '', error: 'timeout' })
    await expect(fetchProwJobs('prow', 'prow')).rejects.toThrow('timeout')
  })

  it('throws on non-zero exit code with fallback message', async () => {
    mockExec.mockResolvedValue({ exitCode: 1, output: '', error: '' })
    await expect(fetchProwJobs('prow', 'prow')).rejects.toThrow('Failed to get ProwJobs')
  })

  it('throws on invalid JSON output', async () => {
    mockExec.mockResolvedValue({ exitCode: 0, output: 'not json', error: '' })
    await expect(fetchProwJobs('prow', 'prow')).rejects.toThrow('invalid JSON')
  })

  it('limits results to 100 items', async () => {
    const items = Array.from({ length: 150 }, (_, i) =>
      makeProwJobResource({ name: `pj-${i}` })
    )
    mockExec.mockResolvedValue({
      exitCode: 0,
      output: JSON.stringify({ items }),
      error: '',
    })

    const jobs = await fetchProwJobs('prow', 'prow')
    expect(jobs).toHaveLength(100)
  })

  it('handles missing items array gracefully', async () => {
    mockExec.mockResolvedValue({
      exitCode: 0,
      output: JSON.stringify({}),
      error: '',
    })

    const jobs = await fetchProwJobs('prow', 'prow')
    expect(jobs).toEqual([])
  })

  it('sets duration to dash for pending jobs', async () => {
    mockExec.mockResolvedValue({
      exitCode: 0,
      output: JSON.stringify({ items: [makeProwJobResource({ state: 'pending' })] }),
      error: '',
    })

    const jobs = await fetchProwJobs('prow', 'prow')
    expect(jobs[0].duration).toBe('-')
  })
})

// ============================================================================
// formatTimeAgo (standalone)
// ============================================================================

describe('formatTimeAgo', () => {
  it('returns just now for recent timestamps', () => {
    const tenSecsAgo = new Date(Date.now() - 10_000).toISOString()
    expect(formatTimeAgo(tenSecsAgo)).toBe('just now')
  })

  it('returns minutes ago for timestamps within the hour', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(formatTimeAgo(fiveMinAgo)).toBe('5m ago')
  })

  it('returns hours ago for timestamps within the day', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60_000).toISOString()
    expect(formatTimeAgo(threeHoursAgo)).toBe('3h ago')
  })

  it('returns days ago for older timestamps', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString()
    expect(formatTimeAgo(twoDaysAgo)).toBe('2d ago')
  })
})
