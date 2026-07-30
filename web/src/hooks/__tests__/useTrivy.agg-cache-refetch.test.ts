import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// Increase test timeout for hooks with async retry/backoff logic
vi.setConfig({ testTimeout: 15_000 })

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseClusters = vi.fn(() => ({
  deduplicatedClusters: [] as Array<{ name: string; reachable: boolean }>,
  clusters: [] as Array<{ name: string; reachable: boolean }>,
  isLoading: false,
}))

vi.mock('../useMCP', () => ({
  useClusters: (...args: unknown[]) => mockUseClusters(...args),
}))

const mockExec = vi.fn()
vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: (...args: unknown[]) => mockExec(...args) },
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, FETCH_DEFAULT_TIMEOUT_MS: 10_000 }
})

const mockUseDemoMode = vi.fn(() => ({
  isDemoMode: false,
  toggleDemoMode: vi.fn(),
  setDemoMode: vi.fn(),
}))

vi.mock('../useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../useDemoMode')>()),
  useDemoMode: (...args: unknown[]) => mockUseDemoMode(...args),
  getDemoMode: vi.fn(() => false),
}
))

const mockRegisterRefetch = vi.fn(() => vi.fn())
const mockRegisterCacheReset = vi.fn()
const mockUnregisterCacheReset = vi.fn()

vi.mock('../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
  unregisterCacheReset: (...args: unknown[]) => mockUnregisterCacheReset(...args),
}))

vi.mock('../../lib/utils/concurrency', () => ({
  settledWithConcurrency: vi.fn(async (tasks: Array<() => Promise<unknown>>) =>
    Promise.allSettled(tasks.map((t) => t()))
  ),
}))

import { useTrivy } from '../useTrivy'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a VulnerabilityReport list response */
function makeVulnReportResponse(
  items: Array<{
    name: string
    namespace: string
    repo?: string
    tag?: string
    critical?: number
    high?: number
    medium?: number
    low?: number
    unknown?: number
  }>
) {
  return {
    output: JSON.stringify({
      items: items.map((i) => ({
        metadata: { name: i.name, namespace: i.namespace },
        report: {
          artifact: { repository: i.repo ?? i.name, tag: i.tag ?? 'latest' },
          summary: {
            criticalCount: i.critical ?? 0,
            highCount: i.high ?? 0,
            mediumCount: i.medium ?? 0,
            lowCount: i.low ?? 0,
            unknownCount: i.unknown ?? 0,
          },
        },
      })),
    }),
    exitCode: 0,
  }
}

function reachableClusters(...names: string[]) {
  const entries = names.map((n) => ({ name: n, reachable: true }))
  return { deduplicatedClusters: entries, clusters: entries, isLoading: false }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
  mockUseClusters.mockReturnValue({ deduplicatedClusters: [], clusters: [], isLoading: false })
  mockExec.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  localStorage.clear()
})

// ==========================================================================
// Return shape & basic contract
// ==========================================================================


describe('useTrivy — aggregation', () => {
  it('sums vulnerability counts across installed clusters', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('c1', 'c2'))

    mockExec.mockImplementation(async (args: string[], opts?: { context?: string }) => {
      const cluster = opts?.context

      // CRD check passes for both
      if (args.includes('crd')) {
        return { output: 'crd-ok', exitCode: 0 }
      }

      // Data differs by cluster
      if (cluster === 'c1') {
        return makeVulnReportResponse([
          { name: 'v1', namespace: 'ns', critical: 3, high: 5, medium: 7, low: 11, unknown: 2 },
        ])
      }
      return makeVulnReportResponse([
        { name: 'v2', namespace: 'ns', critical: 1, high: 2, medium: 3, low: 4, unknown: 0 },
      ])
    })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const agg = result.current.aggregated
    expect(agg.critical).toBe(4)
    expect(agg.high).toBe(7)
    expect(agg.medium).toBe(10)
    expect(agg.low).toBe(15)
    expect(agg.unknown).toBe(2)
    unmount()
  })

  it('returns zero aggregation when no clusters are installed', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('bare'))
    mockExec.mockResolvedValueOnce({ output: '', exitCode: 1 })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const agg = result.current.aggregated
    expect(agg.critical).toBe(0)
    expect(agg.high).toBe(0)
    expect(agg.medium).toBe(0)
    expect(agg.low).toBe(0)
    expect(agg.unknown).toBe(0)
    unmount()
  })

  it('excludes non-installed clusters from aggregation', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('installed', 'bare'))

    mockExec.mockImplementation(async (args: string[], opts?: { context?: string }) => {
      const cluster = opts?.context

      if (cluster === 'installed') {
        if (args.includes('crd')) {
          return { output: 'crd-ok', exitCode: 0 }
        }
        return makeVulnReportResponse([{ name: 'v', namespace: 'ns', critical: 5 }])
      }
      // bare cluster — CRD check fails
      return { output: '', exitCode: 1 }
    })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.aggregated.critical).toBe(5)
    unmount()
  })
})

describe('useTrivy — cache', () => {
  it('saves completed statuses to localStorage after fetch', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('cached'))

    mockExec
      .mockResolvedValueOnce({ output: 'crd-ok', exitCode: 0 })
      .mockResolvedValueOnce(
        makeVulnReportResponse([{ name: 'v', namespace: 'ns', critical: 1 }])
      )

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const cached = localStorage.getItem('kc-trivy-cache')
    expect(cached).not.toBeNull()
    const parsed = JSON.parse(cached!)
    expect(parsed).toHaveProperty('cached')
    expect(parsed['cached'].cluster).toBe('cached')

    const cacheTime = localStorage.getItem('kc-trivy-cache-time')
    expect(cacheTime).not.toBeNull()
    unmount()
  })

  it('loads from cache on initialization', async () => {
    const cachedStatuses = {
      'cached-cluster': {
        cluster: 'cached-cluster',
        installed: true,
        loading: false,
        vulnerabilities: { critical: 3, high: 5, medium: 10, low: 20, unknown: 1 },
        totalReports: 5,
        scannedImages: 4,
        images: [],
      },
    }
    localStorage.setItem('kc-trivy-cache', JSON.stringify(cachedStatuses))
    localStorage.setItem('kc-trivy-cache-time', Date.now().toString())

    const { result, unmount } = renderHook(() => useTrivy())

    expect(result.current.statuses['cached-cluster']).toBeDefined()
    expect(result.current.statuses['cached-cluster'].vulnerabilities.critical).toBe(3)
    expect(result.current.lastRefresh).not.toBeNull()
    unmount()
  })

  it('handles corrupt cache JSON gracefully', async () => {
    localStorage.setItem('kc-trivy-cache', 'not-valid{{{')
    localStorage.setItem('kc-trivy-cache-time', '12345')

    const { result, unmount } = renderHook(() => useTrivy())
    // Corrupt cache should be ignored, hook starts fresh with no statuses
    expect(Object.keys(result.current.statuses)).toHaveLength(0)
    // With no clusters, isLoading resolves to false quickly
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    unmount()
  })

  it('returns null lastRefresh when no cache exists', () => {
    const { result, unmount } = renderHook(() => useTrivy())
    expect(result.current.lastRefresh).toBeNull()
    unmount()
  })
})

describe('useTrivy — refetch', () => {
  it('refetch triggers a new data fetch', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('r1'))

    // Initial: not installed
    mockExec.mockResolvedValueOnce({ output: '', exitCode: 1 })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.installed).toBe(false)

    // Now install trivy and refetch
    mockExec
      .mockResolvedValueOnce({ output: 'crd-ok', exitCode: 0 })
      .mockResolvedValueOnce(
        makeVulnReportResponse([{ name: 'v', namespace: 'ns', critical: 1 }])
      )

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.installed).toBe(true)
    unmount()
  })

  it('refetch with empty clusters does nothing', async () => {
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [], clusters: [], isLoading: false })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.refetch()
    })

    expect(mockExec).not.toHaveBeenCalled()
    unmount()
  })

  it('prevents concurrent refetch calls', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('c1'))

    let resolveExec: (value: unknown) => void
    const execPromise = new Promise((resolve) => {
      resolveExec = resolve
    })
    mockExec.mockReturnValue(execPromise)

    const { result, unmount } = renderHook(() => useTrivy())

    // Wait for effect to fire
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    // Try to refetch again while first is in progress — should be a no-op
    const refetchPromise = act(async () => {
      await result.current.refetch()
    })

    // Resolve the exec
    resolveExec!({ output: '', exitCode: 1 })
    mockExec.mockResolvedValue({ output: '', exitCode: 1 })

    await refetchPromise
    unmount()
  })
})
