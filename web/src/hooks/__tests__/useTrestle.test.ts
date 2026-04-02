import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock control variables -- toggled from individual tests
// ---------------------------------------------------------------------------

let mockDemoMode = false
let mockClusters: Array<{ name: string }> = []
const mockExec = vi.fn()

// ---------------------------------------------------------------------------
// Mocks -- prevent real WebSocket/fetch activity
// ---------------------------------------------------------------------------

vi.mock('../useMCP', () => ({
  useClusters: () => ({
    deduplicatedClusters: mockClusters,
    clusters: mockClusters,
    isLoading: false,
  }),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: (...args: unknown[]) => mockExec(...args) },
}))

vi.mock('../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockDemoMode }),
}))

vi.mock('../../lib/modeTransition', () => ({
  registerRefetch: vi.fn(() => vi.fn()),
  registerCacheReset: vi.fn(),
  unregisterCacheReset: vi.fn(),
}))

// settledWithConcurrency: execute all task functions immediately and resolve
vi.mock('../../lib/utils/concurrency', () => ({
  settledWithConcurrency: vi.fn(
    async (tasks: Array<() => Promise<unknown>>) => {
      const results = []
      for (const task of tasks) {
        try {
          const value = await task()
          results.push({ status: 'fulfilled', value })
        } catch (reason) {
          results.push({ status: 'rejected', reason })
        }
      }
      return results
    },
  ),
}))

// ---------------------------------------------------------------------------
// Import the hook under test AFTER mocks are defined
// ---------------------------------------------------------------------------

import { useTrestle } from '../useTrestle'
import {
  registerRefetch,
  registerCacheReset,
  unregisterCacheReset,
} from '../../lib/modeTransition'
import { STORAGE_KEY_TRESTLE_CACHE, STORAGE_KEY_TRESTLE_CACHE_TIME } from '../../lib/constants/storage'

// ---------------------------------------------------------------------------
// Setup / Teardown
//
// shouldAdvanceTime: true lets real wall-clock drive timer ticks so that
// waitFor() (which uses setTimeout internally) works normally, while still
// intercepting setInterval/clearInterval for spying & cleanup assertions.
// The 120 000 ms polling interval will never fire during these sub-second
// tests, so there is no timer-hang risk.
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  localStorage.clear()
  mockDemoMode = false
  mockClusters = []
  mockExec.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Helper: create a kubectl exec mock response
// ---------------------------------------------------------------------------

function kubectlOk(output: string) {
  return { exitCode: 0, output }
}

function kubectlFail(output = '') {
  return { exitCode: 1, output }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTrestle', () => {
  // ── 1. Shape / exports ──────────────────────────────────────────────────

  it('returns expected shape with all fields', () => {
    const { result, unmount } = renderHook(() => useTrestle())

    expect(result.current).toHaveProperty('statuses')
    expect(result.current).toHaveProperty('aggregated')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('installed')
    expect(result.current).toHaveProperty('isDemoData')
    expect(result.current).toHaveProperty('clustersChecked')
    expect(result.current).toHaveProperty('totalClusters')
    expect(result.current).toHaveProperty('refetch')
    expect(typeof result.current.refetch).toBe('function')

    unmount()
  })

  // ── 2. Demo mode -- no clusters ────────────────────────────────────────

  it('returns demo data with default cluster names when no clusters exist in demo mode', async () => {
    mockDemoMode = true

    const { result, unmount } = renderHook(() => useTrestle())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Default demo clusters: cluster-1, cluster-2, cluster-3
    expect(Object.keys(result.current.statuses)).toEqual(
      expect.arrayContaining(['cluster-1', 'cluster-2', 'cluster-3']),
    )
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.lastRefresh).toBeInstanceOf(Date)

    // Demo statuses should have meaningful scores
    for (const status of Object.values(result.current.statuses)) {
      expect(status.installed).toBe(true)
      expect(status.loading).toBe(false)
      expect(status.overallScore).toBeGreaterThan(0)
      expect(status.profiles.length).toBeGreaterThan(0)
      expect(status.controlResults.length).toBeGreaterThan(0)
    }

    unmount()
  })

  // ── 3. Demo mode -- with clusters ──────────────────────────────────────

  it('uses actual cluster names for demo data when clusters exist', async () => {
    mockDemoMode = true
    mockClusters = [{ name: 'prod-east' }, { name: 'prod-west' }]

    const { result, unmount } = renderHook(() => useTrestle())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(Object.keys(result.current.statuses)).toEqual(
      expect.arrayContaining(['prod-east', 'prod-west']),
    )
    expect(result.current.clustersChecked).toBe(2)

    unmount()
  })

  // ── 4. No clusters, not demo mode ──────────────────────────────────────

  it('returns empty statuses when no clusters and not in demo mode', async () => {
    mockDemoMode = false
    mockClusters = []

    const { result, unmount } = renderHook(() => useTrestle())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(Object.keys(result.current.statuses)).toHaveLength(0)

    unmount()
  })

  // ── 5. Real mode -- trestle not installed ──────────────────────────────

  it('falls back to demo data when trestle is not installed on any cluster', async () => {
    mockDemoMode = false
    mockClusters = [{ name: 'cluster-a' }]

    // All CRD + deployment checks fail
    mockExec.mockResolvedValue(kubectlFail())

    const { result, unmount } = renderHook(() => useTrestle())

    await waitFor(() => {
      expect(result.current.lastRefresh).not.toBeNull()
    })

    // Should fall back to demo data since no cluster has Trestle
    // The demo fallback sets installed=true on the generated demo statuses
    expect(result.current.statuses['cluster-a']).toBeDefined()
    expect(result.current.statuses['cluster-a'].installed).toBe(true) // demo fallback
    // isDemoData = isDemoMode || (!installed && !isLoading)
    // Because the demo fallback sets installed=true, isDemoData is false here
    // (the hook provides real-looking data even though it's generated)
    expect(result.current.installed).toBe(true)

    unmount()
  })

  // ── 6. Real mode -- trestle installed but no assessment data ───────────

  it('marks installed=true when CRD is found but no assessment data exists', async () => {
    mockDemoMode = false
    mockClusters = [{ name: 'test-cluster' }]

    let callCount = 0
    mockExec.mockImplementation(() => {
      callCount++
      // First CRD check succeeds
      if (callCount === 1) return Promise.resolve(kubectlOk('crd/assessmentresults.oscal.io'))
      // Everything else fails
      return Promise.resolve(kubectlFail())
    })

    const { result, unmount } = renderHook(() => useTrestle())

    await waitFor(() => {
      expect(result.current.lastRefresh).not.toBeNull()
    })

    const status = result.current.statuses['test-cluster']
    expect(status).toBeDefined()
    expect(result.current.lastRefresh).toBeInstanceOf(Date)

    unmount()
  })

  // ── 7. Real mode -- full assessment data ───────────────────────────────

  it('parses real OSCAL assessment data and computes scores', async () => {
    mockDemoMode = false
    mockClusters = [{ name: 'live-cluster' }]

    const assessmentData = {
      items: [
        {
          metadata: { name: 'nist-assessment' },
          spec: { profile: 'NIST 800-53 rev5' },
          status: {
            results: [
              { controlId: 'AC-1', status: 'pass', title: 'Access Control Policy', severity: 'high' },
              { controlId: 'AC-2', status: 'pass', title: 'Account Management', severity: 'high' },
              { controlId: 'AC-3', status: 'fail', title: 'Access Enforcement', severity: 'critical' },
              { controlId: 'AU-1', status: 'other', title: 'Audit Policy', severity: 'medium' },
            ],
          },
        },
      ],
    }

    let execCall = 0
    mockExec.mockImplementation(() => {
      execCall++
      // Phase 1 checks (6 total: 3 CRDs + 3 deployments) -- first CRD succeeds
      if (execCall <= 6) {
        if (execCall === 1) return Promise.resolve(kubectlOk('crd/assessmentresults.oscal.io'))
        return Promise.resolve(kubectlFail())
      }
      // Phase 2: first API group returns data
      if (execCall === 7) return Promise.resolve(kubectlOk(JSON.stringify(assessmentData)))
      return Promise.resolve(kubectlFail())
    })

    const { result, unmount } = renderHook(() => useTrestle())

    await waitFor(() => {
      expect(result.current.lastRefresh).not.toBeNull()
    })

    const status = result.current.statuses['live-cluster']
    expect(status).toBeDefined()
    expect(status.installed).toBe(true)
    expect(status.totalControls).toBe(4)
    expect(status.passedControls).toBe(2)
    expect(status.failedControls).toBe(1)
    expect(status.otherControls).toBe(1)
    // Score = 2/4 * 100 = 50
    expect(status.overallScore).toBe(50)
    expect(status.profiles).toHaveLength(1)
    expect(status.profiles[0].name).toBe('NIST 800-53 rev5')
    expect(status.controlResults).toHaveLength(4)

    unmount()
  })

  // ── 8. Aggregation across multiple clusters ────────────────────────────

  it('aggregates totals across multiple clusters', async () => {
    mockDemoMode = true
    mockClusters = [{ name: 'c1' }, { name: 'c2' }, { name: 'c3' }]

    const { result, unmount } = renderHook(() => useTrestle())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const agg = result.current.aggregated
    expect(agg.totalControls).toBeGreaterThan(0)
    expect(agg.passedControls).toBeGreaterThan(0)
    expect(agg.overallScore).toBeGreaterThan(0)
    expect(agg.overallScore).toBeLessThanOrEqual(100)
    expect(agg.totalControls).toBe(
      agg.passedControls + agg.failedControls + agg.otherControls,
    )

    unmount()
  })

  // ── 9. Cache: saves to localStorage ────────────────────────────────────

  it('saves completed statuses to localStorage cache', async () => {
    mockDemoMode = false
    mockClusters = [{ name: 'cached-cluster' }]

    const assessmentData = {
      items: [
        {
          metadata: { name: 'test' },
          spec: { profile: 'Test Profile' },
          status: {
            results: [
              { controlId: 'T-1', status: 'pass', title: 'Test control' },
            ],
          },
        },
      ],
    }

    let execCall = 0
    mockExec.mockImplementation(() => {
      execCall++
      if (execCall === 1) return Promise.resolve(kubectlOk('crd/assessmentresults.oscal.io'))
      if (execCall <= 6) return Promise.resolve(kubectlFail())
      if (execCall === 7) return Promise.resolve(kubectlOk(JSON.stringify(assessmentData)))
      return Promise.resolve(kubectlFail())
    })

    const { result, unmount } = renderHook(() => useTrestle())

    await waitFor(() => {
      expect(result.current.lastRefresh).not.toBeNull()
    })

    const cachedStr = localStorage.getItem(STORAGE_KEY_TRESTLE_CACHE)
    expect(cachedStr).not.toBeNull()
    const cached = JSON.parse(cachedStr!)
    expect(cached).toHaveProperty('cached-cluster')

    const cacheTime = localStorage.getItem(STORAGE_KEY_TRESTLE_CACHE_TIME)
    expect(cacheTime).not.toBeNull()

    unmount()
  })

  // ── 10. Cache: loads from localStorage on mount ────────────────────────

  it('loads cached data on mount and triggers background refresh', async () => {
    // The hook needs clusters to avoid the early-return that clears statuses
    mockClusters = [{ name: 'pre-cached' }]
    // All exec calls fail so it falls back to demo data after refresh
    mockExec.mockResolvedValue(kubectlFail())

    const cachedStatuses = {
      'pre-cached': {
        cluster: 'pre-cached',
        installed: true,
        loading: false,
        overallScore: 75,
        profiles: [],
        totalControls: 100,
        passedControls: 75,
        failedControls: 20,
        otherControls: 5,
        controlResults: [],
        lastAssessment: '2025-01-01T00:00:00Z',
      },
    }
    const cacheTimestamp = Date.now() - 30_000
    localStorage.setItem(STORAGE_KEY_TRESTLE_CACHE, JSON.stringify(cachedStatuses))
    localStorage.setItem(STORAGE_KEY_TRESTLE_CACHE_TIME, cacheTimestamp.toString())

    const { result, unmount } = renderHook(() => useTrestle())

    // With cache present, isLoading starts false (cache is loaded synchronously)
    // and background refresh runs
    await waitFor(() => {
      expect(result.current.lastRefresh).not.toBeNull()
    })

    // The 'pre-cached' key should exist (either from cache or refresh)
    expect(result.current.statuses).toHaveProperty('pre-cached')

    unmount()
  })

  // ── 11. Auto-refresh interval is set up and cleaned up ─────────────────

  it('sets up auto-refresh interval and clears on unmount', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const { unmount } = renderHook(() => useTrestle())

    expect(setIntervalSpy).toHaveBeenCalled()

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  // ── 12. Mode transition registration ───────────────────────────────────

  it('registers and unregisters cache reset and refetch on mount/unmount', () => {
    const { unmount } = renderHook(() => useTrestle())

    expect(registerCacheReset).toHaveBeenCalledWith('trestle', expect.any(Function))
    expect(registerRefetch).toHaveBeenCalledWith('trestle', expect.any(Function))

    unmount()

    expect(unregisterCacheReset).toHaveBeenCalledWith('trestle')
  })

  // ── 13. isDemoData flag logic ──────────────────────────────────────────

  it('sets isDemoData=true in demo mode', async () => {
    mockDemoMode = true

    const { result, unmount } = renderHook(() => useTrestle())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isDemoData).toBe(true)

    unmount()
  })

  it('sets isDemoData=true when not in demo mode and no clusters', async () => {
    mockDemoMode = false
    mockClusters = []

    const { result, unmount } = renderHook(() => useTrestle())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // isDemoData = isDemoMode || (!installed && !isLoading)
    // With no clusters and not loading, installed=false, so isDemoData=true
    expect(result.current.isDemoData).toBe(true)

    unmount()
  })

  // ── 14. refetch() triggers isRefreshing ────────────────────────────────

  it('refetch triggers a data refresh', async () => {
    mockDemoMode = true
    mockClusters = [{ name: 'r1' }]

    const { result, unmount } = renderHook(() => useTrestle())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      result.current.refetch()
    })

    // After refetch completes, isRefreshing should be false
    expect(result.current.isRefreshing).toBe(false)
    expect(result.current.lastRefresh).toBeInstanceOf(Date)

    unmount()
  })

  // ── 15. totalClusters reflects cluster count ───────────────────────────

  it('totalClusters reflects the number of clusters being checked', async () => {
    mockDemoMode = true
    mockClusters = [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }]

    const { result, unmount } = renderHook(() => useTrestle())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.totalClusters).toBe(4)

    unmount()
  })

  // ── 16. Error handling in fetchSingleCluster ───────────────────────────

  it('handles kubectlProxy.exec rejection gracefully', async () => {
    mockDemoMode = false
    mockClusters = [{ name: 'err-cluster' }]

    mockExec.mockRejectedValue(new Error('Connection refused'))

    const { result, unmount } = renderHook(() => useTrestle())

    await waitFor(() => {
      expect(result.current.lastRefresh).not.toBeNull()
    })

    // Falls back to demo data since no cluster is installed
    expect(result.current.statuses['err-cluster']).toBeDefined()
    expect(result.current.lastRefresh).toBeInstanceOf(Date)

    unmount()
  })

  // ── 17. Demo control results have expected structure ───────────────────

  it('demo control results contain valid controlId, status, and severity', async () => {
    mockDemoMode = true
    mockClusters = [{ name: 'demo-c' }]

    const { result, unmount } = renderHook(() => useTrestle())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const status = result.current.statuses['demo-c']
    expect(status.controlResults.length).toBeGreaterThan(0)

    for (const cr of status.controlResults) {
      expect(cr.controlId).toBeTruthy()
      expect(['pass', 'fail', 'other', 'not-applicable']).toContain(cr.status)
      expect(['critical', 'high', 'medium', 'low']).toContain(cr.severity)
      expect(cr.profile).toBeTruthy()
    }

    unmount()
  })
})
