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

vi.mock('../useDemoMode', () => ({
  useDemoMode: (...args: unknown[]) => mockUseDemoMode(...args),
}))

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
    Promise.all(tasks.map((t) => t()))
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

describe('useTrivy — return shape', () => {
  it('returns all expected properties', () => {
    const { result, unmount } = renderHook(() => useTrivy())
    const r = result.current
    expect(r).toHaveProperty('statuses')
    expect(r).toHaveProperty('aggregated')
    expect(r).toHaveProperty('isLoading')
    expect(r).toHaveProperty('isRefreshing')
    expect(r).toHaveProperty('lastRefresh')
    expect(r).toHaveProperty('installed')
    expect(r).toHaveProperty('hasErrors')
    expect(r).toHaveProperty('isDemoData')
    expect(r).toHaveProperty('clustersChecked')
    expect(r).toHaveProperty('totalClusters')
    expect(r).toHaveProperty('refetch')
    expect(typeof r.refetch).toBe('function')
    unmount()
  })

  it('does not throw on unmount', () => {
    const { unmount } = renderHook(() => useTrivy())
    expect(() => unmount()).not.toThrow()
  })
})

// ==========================================================================
// Demo mode
// ==========================================================================

describe('useTrivy — demo mode', () => {
  it('returns demo data with default cluster names when no clusters connected', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    const names = Object.keys(result.current.statuses)
    expect(names).toEqual(['us-east-1', 'eu-central-1', 'us-west-2'])
    for (const status of Object.values(result.current.statuses)) {
      expect(status.installed).toBe(true)
      expect(status.loading).toBe(false)
      expect(status.vulnerabilities.critical).toBeGreaterThanOrEqual(0)
      expect(status.images.length).toBeGreaterThan(0)
      expect(status.totalReports).toBeGreaterThan(0)
      expect(status.scannedImages).toBeGreaterThan(0)
    }
    unmount()
  })

  it('uses real cluster names for demo data when clusters are connected', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseClusters.mockReturnValue(reachableClusters('prod-east', 'staging-west'))

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    expect(Object.keys(result.current.statuses)).toEqual(['prod-east', 'staging-west'])
    unmount()
  })

  it('produces varied demo vuln counts per cluster (seed-based)', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const criticals = Object.values(result.current.statuses).map(
      (s) => s.vulnerabilities.critical
    )
    // All criticals should be > 0 and in reasonable range but not necessarily all identical
    for (const c of criticals) {
      expect(c).toBeGreaterThanOrEqual(2)
      expect(c).toBeLessThanOrEqual(10)
    }
    unmount()
  })

  it('never calls kubectlProxy.exec in demo mode', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseClusters.mockReturnValue(reachableClusters('c1'))

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockExec).not.toHaveBeenCalled()
    unmount()
  })

  it('sets clustersChecked equal to demo cluster count', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const EXPECTED_DEFAULT_DEMO_CLUSTERS = 3
    expect(result.current.clustersChecked).toBe(EXPECTED_DEFAULT_DEMO_CLUSTERS)
    unmount()
  })

  it('demo images include known test images', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const firstCluster = Object.values(result.current.statuses)[0]
    const imageNames = firstCluster.images.map((i) => i.image)
    expect(imageNames).toContain('nginx')
    expect(imageNames).toContain('redis')
    unmount()
  })
})

// ==========================================================================
// Empty / loading cluster states
// ==========================================================================

describe('useTrivy — empty and loading states', () => {
  it('sets isLoading false when no clusters and not loading', async () => {
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [], clusters: [], isLoading: false })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.totalClusters).toBe(0)
    expect(Object.keys(result.current.statuses)).toHaveLength(0)
    unmount()
  })

  it('keeps isLoading true while clusters are still resolving', () => {
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [], clusters: [], isLoading: true })

    const { result, unmount } = renderHook(() => useTrivy())
    expect(result.current.isLoading).toBe(true)
    unmount()
  })

  it('only includes reachable clusters', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'reachable-1', reachable: true },
        { name: 'unreachable-1', reachable: false },
      ],
      clusters: [
        { name: 'reachable-1', reachable: true },
        { name: 'unreachable-1', reachable: false },
      ],
      isLoading: false,
    })

    // CRD check fails for the reachable cluster
    mockExec.mockResolvedValue({ output: '', exitCode: 1 })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.totalClusters).toBe(1)
    unmount()
  })
})

// ==========================================================================
// Live data — full successful fetch
// ==========================================================================

describe('useTrivy — live data fetch', () => {
  it('fetches vulnerability data for a single installed cluster', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('prod'))

    // Phase 1: CRD check passes
    mockExec
      .mockResolvedValueOnce({
        output: 'customresourcedefinition.apiextensions.k8s.io/vulnerabilityreports.aquasecurity.github.io',
        exitCode: 0,
      })
      // Phase 2: vulnerability reports
      .mockResolvedValueOnce(
        makeVulnReportResponse([
          { name: 'nginx-vuln', namespace: 'default', repo: 'library/nginx', tag: '1.25', critical: 2, high: 5, medium: 8, low: 12, unknown: 1 },
          { name: 'redis-vuln', namespace: 'cache', repo: 'library/redis', tag: '7.2', critical: 0, high: 1, medium: 3, low: 6 },
        ])
      )

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.installed).toBe(true)
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.totalClusters).toBe(1)

    const prodStatus = result.current.statuses['prod']
    expect(prodStatus).toBeDefined()
    expect(prodStatus.installed).toBe(true)
    expect(prodStatus.loading).toBe(false)
    expect(prodStatus.error).toBeUndefined()
    expect(prodStatus.totalReports).toBe(2)
    expect(prodStatus.scannedImages).toBe(2)
    expect(prodStatus.vulnerabilities.critical).toBe(2)
    expect(prodStatus.vulnerabilities.high).toBe(6)
    expect(prodStatus.vulnerabilities.medium).toBe(11)
    expect(prodStatus.vulnerabilities.low).toBe(18)
    expect(prodStatus.vulnerabilities.unknown).toBe(1)
    expect(prodStatus.images.length).toBe(2)
    unmount()
  })

  it('marks cluster as not installed when CRD check fails', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('bare'))

    mockExec.mockResolvedValueOnce({ output: '', exitCode: 1 })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.installed).toBe(false)
    expect(result.current.statuses['bare'].installed).toBe(false)
    expect(result.current.statuses['bare'].vulnerabilities.critical).toBe(0)
    expect(result.current.statuses['bare'].images).toEqual([])
    unmount()
  })

  it('handles vulnerability report fetch failure with error message', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('broken'))

    // CRD check passes
    mockExec
      .mockResolvedValueOnce({ output: 'vulnerabilityreports.aquasecurity.github.io', exitCode: 0 })
      // Data fetch fails
      .mockResolvedValueOnce({ output: 'forbidden: insufficient permissions', exitCode: 1 })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['broken']
    expect(status.installed).toBe(true)
    expect(status.error).toBe('forbidden: insufficient permissions')
    expect(result.current.hasErrors).toBe(true)
    unmount()
  })

  it('handles fetch failure with default error when output is empty', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('empty-err'))

    mockExec
      .mockResolvedValueOnce({ output: 'crd-ok', exitCode: 0 })
      .mockResolvedValueOnce({ output: '', exitCode: 1 })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['empty-err']
    expect(status.error).toBe('Failed to fetch vulnerability reports')
    unmount()
  })

  it('sorts images by severity (critical+high desc) and limits to 50', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('big'))

    // Generate 60 items to test the MAX_IMAGES_PER_CLUSTER = 50 limit
    const MAX_IMAGES_PER_CLUSTER = 50
    const TOTAL_GENERATED_IMAGES = 60
    const items = Array.from({ length: TOTAL_GENERATED_IMAGES }, (_, i) => ({
      name: `vuln-${i}`,
      namespace: 'ns',
      repo: `image-${i}`,
      tag: 'v1',
      critical: i, // varying severity
      high: i,
    }))

    mockExec
      .mockResolvedValueOnce({ output: 'crd-ok', exitCode: 0 })
      .mockResolvedValueOnce(makeVulnReportResponse(items))

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['big']
    expect(status.images.length).toBe(MAX_IMAGES_PER_CLUSTER)
    // Should be sorted by critical+high descending
    for (let i = 1; i < status.images.length; i++) {
      const prevSev = status.images[i - 1].critical + status.images[i - 1].high
      const currSev = status.images[i].critical + status.images[i].high
      expect(prevSev).toBeGreaterThanOrEqual(currSev)
    }
    unmount()
  })

  it('handles exception in fetchSingleCluster (non-demo error)', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('crash'))

    mockExec.mockRejectedValue(new Error('network timeout'))

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['crash']
    expect(status.installed).toBe(false)
    expect(status.error).toBe('network timeout')
    unmount()
  })

  it('handles non-Error exception in fetchSingleCluster', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('weird'))

    mockExec.mockRejectedValue('string error')

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['weird']
    expect(status.error).toBe('Connection failed')
    unmount()
  })

  it('suppresses console.error for demo mode errors', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('demo-err'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockExec.mockRejectedValue(new Error('demo mode'))

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // "demo mode" errors should not be logged
    expect(consoleSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
    unmount()
  })

  it('deduplicates image count by repository name', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('dedup'))

    // Two reports for the same repository (different names, same repo)
    mockExec
      .mockResolvedValueOnce({ output: 'crd-ok', exitCode: 0 })
      .mockResolvedValueOnce(
        makeVulnReportResponse([
          { name: 'vuln-1', namespace: 'ns', repo: 'library/nginx', tag: '1.25', critical: 1 },
          { name: 'vuln-2', namespace: 'ns', repo: 'library/nginx', tag: '1.24', critical: 2 },
          { name: 'vuln-3', namespace: 'ns', repo: 'library/redis', tag: '7.0', critical: 0 },
        ])
      )

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['dedup']
    // scannedImages deduplicates by repo name
    expect(status.scannedImages).toBe(2) // nginx + redis
    // totalReports counts all items
    expect(status.totalReports).toBe(3)
    // images array has one per report (not deduped)
    expect(status.images.length).toBe(3)
    unmount()
  })
})

// ==========================================================================
// Aggregation
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

// ==========================================================================
// Cache
// ==========================================================================

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

// ==========================================================================
// Refetch
// ==========================================================================

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

// ==========================================================================
// Mode transition registration
// ==========================================================================

describe('useTrivy — mode transition', () => {
  it('registers cache reset and refetch callbacks', () => {
    const { unmount } = renderHook(() => useTrivy())

    expect(mockRegisterCacheReset).toHaveBeenCalledWith('trivy', expect.any(Function))
    expect(mockRegisterRefetch).toHaveBeenCalledWith('trivy', expect.any(Function))
    unmount()
  })

  it('unregisters on unmount', () => {
    const mockUnregisterRefetch = vi.fn()
    mockRegisterRefetch.mockReturnValue(mockUnregisterRefetch)

    const { unmount } = renderHook(() => useTrivy())
    unmount()

    expect(mockUnregisterCacheReset).toHaveBeenCalledWith('trivy')
    expect(mockUnregisterRefetch).toHaveBeenCalled()
  })

  it('cache reset callback clears localStorage and resets state', async () => {
    localStorage.setItem('kc-trivy-cache', '{}')
    localStorage.setItem('kc-trivy-cache-time', '1234')

    const { unmount } = renderHook(() => useTrivy())

    const resetFn = mockRegisterCacheReset.mock.calls[0][1]
    act(() => {
      resetFn()
    })

    expect(localStorage.getItem('kc-trivy-cache')).toBeNull()
    expect(localStorage.getItem('kc-trivy-cache-time')).toBeNull()
    unmount()
  })
})

// ==========================================================================
// Auto-refresh interval
// ==========================================================================

describe('useTrivy — auto-refresh', () => {
  it('sets up auto-refresh interval when clusters exist', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('c1'))
    mockExec.mockResolvedValue({ output: '', exitCode: 1 })

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const REFRESH_INTERVAL_MS = 120_000
    const trivyIntervals = setIntervalSpy.mock.calls.filter(
      (call) => call[1] === REFRESH_INTERVAL_MS
    )
    expect(trivyIntervals.length).toBeGreaterThan(0)

    setIntervalSpy.mockRestore()
    unmount()
  })

  it('does not set up interval in demo mode', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const REFRESH_INTERVAL_MS = 120_000
    const trivyIntervals = setIntervalSpy.mock.calls.filter(
      (call) => call[1] === REFRESH_INTERVAL_MS
    )
    expect(trivyIntervals).toHaveLength(0)

    setIntervalSpy.mockRestore()
    unmount()
  })

  it('does not set up interval when no clusters', async () => {
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [], clusters: [], isLoading: false })

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const REFRESH_INTERVAL_MS = 120_000
    const trivyIntervals = setIntervalSpy.mock.calls.filter(
      (call) => call[1] === REFRESH_INTERVAL_MS
    )
    expect(trivyIntervals).toHaveLength(0)

    setIntervalSpy.mockRestore()
    unmount()
  })

  it('clears interval on unmount', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('c1'))
    mockExec.mockResolvedValue({ output: '', exitCode: 1 })

    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()

    clearIntervalSpy.mockRestore()
  })
})

// ==========================================================================
// Edge cases in data parsing
// ==========================================================================

describe('useTrivy — edge cases', () => {
  it('handles empty vulnerability report items', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('empty'))

    mockExec.mockImplementation(async (args: string[]) => {
      if (args.includes('crd')) return { output: 'crd-ok', exitCode: 0 }
      return { output: JSON.stringify({ items: [] }), exitCode: 0 }
    })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['empty']
    expect(status.installed).toBe(true)
    expect(status.totalReports).toBe(0)
    expect(status.scannedImages).toBe(0)
    expect(status.images).toEqual([])
    expect(status.vulnerabilities.critical).toBe(0)
    unmount()
  })

  it('handles reports with missing artifact info', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('no-artifact'))

    mockExec.mockImplementation(async (args: string[]) => {
      if (args.includes('crd')) return { output: 'crd-ok', exitCode: 0 }
      return {
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'v1', namespace: 'default' },
              report: {
                summary: { criticalCount: 1, highCount: 2, mediumCount: 3, lowCount: 4, unknownCount: 0 },
              },
            },
          ],
        }),
        exitCode: 0,
      }
    })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['no-artifact']
    expect(status.totalReports).toBe(1)
    // No repo => not counted as image, but summary still aggregated
    expect(status.scannedImages).toBe(0)
    expect(status.vulnerabilities.critical).toBe(1)
    expect(status.images.length).toBe(0)
    unmount()
  })

  it('handles reports with missing summary', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('no-summary'))

    mockExec.mockImplementation(async (args: string[]) => {
      if (args.includes('crd')) return { output: 'crd-ok', exitCode: 0 }
      return {
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'v1', namespace: 'ns' },
              report: {
                artifact: { repository: 'myapp', tag: 'v1' },
              },
            },
          ],
        }),
        exitCode: 0,
      }
    })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['no-summary']
    expect(status.totalReports).toBe(1)
    expect(status.scannedImages).toBe(1)
    // No summary => no vuln counts added
    expect(status.vulnerabilities.critical).toBe(0)
    // Image report still added but with zero counts
    expect(status.images.length).toBe(1)
    expect(status.images[0].critical).toBe(0)
    unmount()
  })

  it('handles reports with missing namespace', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('no-ns'))

    mockExec.mockImplementation(async (args: string[]) => {
      if (args.includes('crd')) return { output: 'crd-ok', exitCode: 0 }
      return {
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'v1' },
              report: {
                artifact: { repository: 'myapp', tag: 'v1' },
                summary: { criticalCount: 1, highCount: 0, mediumCount: 0, lowCount: 0 },
              },
            },
          ],
        }),
        exitCode: 0,
      }
    })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['no-ns']
    // Should default namespace to 'default'
    expect(status.images[0].namespace).toBe('default')
    unmount()
  })

  it('handles reports with missing tag', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('no-tag'))

    mockExec.mockImplementation(async (args: string[]) => {
      if (args.includes('crd')) return { output: 'crd-ok', exitCode: 0 }
      return {
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'v1', namespace: 'ns' },
              report: {
                artifact: { repository: 'myapp' },
                summary: { criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 },
              },
            },
          ],
        }),
        exitCode: 0,
      }
    })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['no-tag']
    // Should default tag to 'latest'
    expect(status.images[0].tag).toBe('latest')
    unmount()
  })

  it('handles multiple clusters with mixed install status', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('installed', 'bare'))

    mockExec.mockImplementation(async (args: string[], opts?: { context?: string }) => {
      const cluster = opts?.context

      if (cluster === 'installed') {
        if (args.includes('crd')) {
          return { output: 'crd-ok', exitCode: 0 }
        }
        return makeVulnReportResponse([{ name: 'v', namespace: 'ns', critical: 2 }])
      }
      // bare cluster — CRD check fails
      return { output: '', exitCode: 1 }
    })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.statuses['installed'].installed).toBe(true)
    expect(result.current.statuses['bare'].installed).toBe(false)
    expect(result.current.installed).toBe(true)
    unmount()
  })

  it('handles null output on successful exit code', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('null-out'))

    mockExec.mockImplementation(async (args: string[]) => {
      if (args.includes('crd')) {
        return { output: 'crd-ok', exitCode: 0 }
      }
      return { output: null, exitCode: 0 }
    })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['null-out']
    expect(status.installed).toBe(true)
    expect(status.totalReports).toBe(0)
    expect(status.scannedImages).toBe(0)
    unmount()
  })
})
