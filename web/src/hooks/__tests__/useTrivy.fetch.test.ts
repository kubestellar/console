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
