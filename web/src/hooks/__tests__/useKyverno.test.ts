import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook,waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock control variables -- toggled from individual tests
// ---------------------------------------------------------------------------

let mockDemoMode = false
let mockClustersLoading = false
let mockAllClusters: Array<{ name: string; reachable?: boolean }> = []
const mockExec = vi.fn()

// ---------------------------------------------------------------------------
// Mocks -- prevent real WebSocket/fetch activity
// ---------------------------------------------------------------------------

vi.mock('../useMCP', () => ({
  useClusters: () => ({
    clusters: mockAllClusters,
    deduplicatedClusters: mockAllClusters,
    isLoading: mockClustersLoading,
  }),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: (...args: unknown[]) => mockExec(...args) },
}))

vi.mock('../useDemoMode', () => ({
  useDemoMode: () => ({
    isDemoMode: mockDemoMode,
    toggleDemoMode: vi.fn(),
    setDemoMode: vi.fn(),
  }),
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
        } catch (reason: unknown) {
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

import { useKyverno } from '../useKyverno'
import {
  registerRefetch,
  registerCacheReset,
  unregisterCacheReset,
} from '../../lib/modeTransition'
import { STORAGE_KEY_KYVERNO_CACHE, STORAGE_KEY_KYVERNO_CACHE_TIME } from '../../lib/constants/storage'

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
  mockClustersLoading = false
  mockAllClusters = []
  mockExec.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Helpers
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

describe('useKyverno', () => {
  // ── 1. Shape / exports ──────────────────────────────────────────────────

  it('returns expected shape with all fields', () => {
    const { result, unmount } = renderHook(() => useKyverno())

    expect(result.current).toHaveProperty('statuses')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('installed')
    expect(result.current).toHaveProperty('hasErrors')
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
    mockAllClusters = []

    const { result, unmount } = renderHook(() => useKyverno())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Default demo clusters: us-east-1, eu-central-1, us-west-2
    const keys = Object.keys(result.current.statuses)
    expect(keys).toEqual(
      expect.arrayContaining(['us-east-1', 'eu-central-1', 'us-west-2']),
    )
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.lastRefresh).toBeInstanceOf(Date)

    // Demo statuses should have policies
    for (const status of Object.values(result.current.statuses)) {
      expect(status.installed).toBe(true)
      expect(status.loading).toBe(false)
      expect(status.policies.length).toBeGreaterThan(0)
      expect(status.totalPolicies).toBeGreaterThan(0)
    }

    unmount()
  })

  // ── 3. Demo mode -- with clusters ──────────────────────────────────────

  it('uses actual cluster names for demo data when reachable clusters exist', async () => {
    mockDemoMode = true
    mockAllClusters = [
      { name: 'prod-east', reachable: true },
      { name: 'prod-west', reachable: true },
    ]

    const { result, unmount } = renderHook(() => useKyverno())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(Object.keys(result.current.statuses)).toEqual(
      expect.arrayContaining(['prod-east', 'prod-west']),
    )
    expect(result.current.clustersChecked).toBe(2)

    unmount()
  })

  // ── 4. No clusters, not demo mode -- clusters still loading ────────────

  it('stays in loading state while clusters are still loading', () => {
    mockDemoMode = false
    mockAllClusters = []
    mockClustersLoading = true

    const { result, unmount } = renderHook(() => useKyverno())

    // When no cached data and clusters still loading, isLoading stays true
    expect(result.current.isLoading).toBe(true)

    unmount()
  })

  // ── 5. No clusters, not demo mode, clusters done loading ───────────────

  it('returns empty statuses when no clusters exist and not in demo mode', async () => {
    mockDemoMode = false
    mockAllClusters = []
    mockClustersLoading = false

    const { result, unmount } = renderHook(() => useKyverno())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(Object.keys(result.current.statuses)).toHaveLength(0)

    unmount()
  })

  // ── 6. Real mode -- kyverno not installed ──────────────────────────────

  it('marks installed=false when Kyverno CRD is not found', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'no-kyverno', reachable: true }]

    mockExec.mockResolvedValue(kubectlFail())

    const { result, unmount } = renderHook(() => useKyverno())

    await waitFor(() => {
      expect(result.current.lastRefresh).not.toBeNull()
    })

    const status = result.current.statuses['no-kyverno']
    expect(status).toBeDefined()
    expect(status.installed).toBe(false)
    expect(status.policies).toHaveLength(0)
    expect(result.current.installed).toBe(false)

    unmount()
  })

  // ── 7. Real mode -- kyverno installed, fetch ClusterPolicies ───────────

  it('fetches and parses ClusterPolicies when Kyverno is installed', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'live-cluster', reachable: true }]

    const clusterPoliciesData = {
      items: [
        {
          metadata: {
            name: 'disallow-privileged',
            annotations: {
              'policies.kyverno.io/category': 'Pod Security',
              'policies.kyverno.io/description': 'Disallow privileged containers',
            },
          },
          spec: {
            validationFailureAction: 'Enforce',
            background: true,
          },
        },
        {
          metadata: {
            name: 'require-labels',
            annotations: {
              'policies.kyverno.io/category': 'Best Practices',
              'policies.kyverno.io/description': 'Require app labels',
            },
          },
          spec: {
            validationFailureAction: 'Audit',
            background: false,
          },
        },
      ],
    }

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      switch (callIdx) {
        case 1: // CRD check
          return Promise.resolve(kubectlOk('crd/clusterpolicies.kyverno.io'))
        case 2: // ClusterPolicies fetch
          return Promise.resolve(kubectlOk(JSON.stringify(clusterPoliciesData)))
        case 3: // Namespaced Policies fetch
          return Promise.resolve(kubectlOk(JSON.stringify({ items: [] })))
        case 4: // PolicyReports
          return Promise.resolve(kubectlOk(JSON.stringify({ items: [] })))
        case 5: // ClusterPolicyReports
          return Promise.resolve(kubectlOk(JSON.stringify({ items: [] })))
        default:
          return Promise.resolve(kubectlFail())
      }
    })

    const { result, unmount } = renderHook(() => useKyverno())

    await waitFor(() => {
      expect(result.current.lastRefresh).not.toBeNull()
    })

    const status = result.current.statuses['live-cluster']
    expect(status).toBeDefined()
    expect(status.installed).toBe(true)
    expect(status.totalPolicies).toBe(2)
    expect(status.enforcingCount).toBe(1)
    expect(status.auditCount).toBe(1)

    const enforcePolicy = status.policies.find(p => p.name === 'disallow-privileged')
    expect(enforcePolicy).toBeDefined()
    expect(enforcePolicy!.status).toBe('enforcing')
    expect(enforcePolicy!.kind).toBe('ClusterPolicy')
    expect(enforcePolicy!.category).toBe('Pod Security')
    expect(enforcePolicy!.background).toBe(true)

    const auditPolicy = status.policies.find(p => p.name === 'require-labels')
    expect(auditPolicy).toBeDefined()
    expect(auditPolicy!.status).toBe('audit')
    expect(auditPolicy!.background).toBe(false)

    unmount()
  })

  // ── 8. Namespaced policies ─────────────────────────────────────────────

  it('fetches namespaced Policies alongside ClusterPolicies', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'ns-cluster', reachable: true }]

    const nsPolicy = {
      items: [
        {
          metadata: {
            name: 'ns-restrict',
            namespace: 'production',
            annotations: {},
          },
          spec: { validationFailureAction: 'Enforce', background: true },
        },
      ],
    }

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      switch (callIdx) {
        case 1: return Promise.resolve(kubectlOk('crd/clusterpolicies.kyverno.io'))
        case 2: return Promise.resolve(kubectlOk(JSON.stringify({ items: [] }))) // ClusterPolicies
        case 3: return Promise.resolve(kubectlOk(JSON.stringify(nsPolicy))) // Namespaced
        case 4: return Promise.resolve(kubectlOk(JSON.stringify({ items: [] }))) // PolicyReports
        case 5: return Promise.resolve(kubectlOk(JSON.stringify({ items: [] }))) // ClusterPolicyReports
        default: return Promise.resolve(kubectlFail())
      }
    })

    const { result, unmount } = renderHook(() => useKyverno())

    await waitFor(() => {
      expect(result.current.lastRefresh).not.toBeNull()
    })

    const status = result.current.statuses['ns-cluster']
    expect(status.policies).toHaveLength(1)
    expect(status.policies[0].kind).toBe('Policy')
    expect(status.policies[0].namespace).toBe('production')
    expect(status.policies[0].status).toBe('enforcing')

    unmount()
  })

  // ── 9. PolicyReports -- violation counting ─────────────────────────────

  it('populates violation counts from PolicyReports', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'report-cluster', reachable: true }]

    const cpData = {
      items: [
        {
          metadata: { name: 'require-labels', annotations: {} },
          spec: { validationFailureAction: 'Audit' },
        },
      ],
    }

    const reportData = {
      items: [
        {
          metadata: { name: 'polr-default', namespace: 'default' },
          summary: { pass: 10, fail: 3, warn: 1, error: 0, skip: 2 },
          results: [
            { policy: 'require-labels', rule: 'check-labels', result: 'fail' },
            { policy: 'require-labels', rule: 'check-labels', result: 'fail' },
            { policy: 'unknown-policy', rule: 'r1', result: 'fail' },
          ],
        },
      ],
    }

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      switch (callIdx) {
        case 1: return Promise.resolve(kubectlOk('crd/clusterpolicies.kyverno.io'))
        case 2: return Promise.resolve(kubectlOk(JSON.stringify(cpData)))
        case 3: return Promise.resolve(kubectlOk(JSON.stringify({ items: [] })))
        case 4: return Promise.resolve(kubectlOk(JSON.stringify(reportData)))
        case 5: return Promise.resolve(kubectlOk(JSON.stringify({ items: [] })))
        default: return Promise.resolve(kubectlFail())
      }
    })

    const { result, unmount } = renderHook(() => useKyverno())

    await waitFor(() => {
      expect(result.current.lastRefresh).not.toBeNull()
    })

    const status = result.current.statuses['report-cluster']
    expect(status.totalViolations).toBe(3)
    const policy = status.policies.find(p => p.name === 'require-labels')
    expect(policy).toBeDefined()
    expect(policy!.violations).toBe(2)

    expect(status.reports).toHaveLength(1)
    expect(status.reports[0].pass).toBe(10)
    expect(status.reports[0].fail).toBe(3)

    unmount()
  })

  // ── 10. ClusterPolicyReports also contribute to violations ─────────────

  it('counts violations from ClusterPolicyReports', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'cpr-cluster', reachable: true }]

    const cpData = {
      items: [
        {
          metadata: { name: 'disallow-priv', annotations: {} },
          spec: { validationFailureAction: 'Enforce' },
        },
      ],
    }

    const clusterReportData = {
      items: [
        {
          metadata: { name: 'cpolr-1', namespace: '' },
          summary: { pass: 5, fail: 4, warn: 0, error: 0, skip: 0 },
          results: [
            { policy: 'disallow-priv', rule: 'r1', result: 'fail' },
            { policy: 'disallow-priv', rule: 'r2', result: 'fail' },
            { policy: 'disallow-priv', rule: 'r3', result: 'fail' },
          ],
        },
      ],
    }

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      switch (callIdx) {
        case 1: return Promise.resolve(kubectlOk('crd/clusterpolicies.kyverno.io'))
        case 2: return Promise.resolve(kubectlOk(JSON.stringify(cpData)))
        case 3: return Promise.resolve(kubectlOk(JSON.stringify({ items: [] })))
        case 4: return Promise.resolve(kubectlOk(JSON.stringify({ items: [] })))
        case 5: return Promise.resolve(kubectlOk(JSON.stringify(clusterReportData)))
        default: return Promise.resolve(kubectlFail())
      }
    })

    const { result, unmount } = renderHook(() => useKyverno())

    await waitFor(() => {
      expect(result.current.lastRefresh).not.toBeNull()
    })

    const status = result.current.statuses['cpr-cluster']
    expect(status.totalViolations).toBe(4)
    const policy = status.policies.find(p => p.name === 'disallow-priv')
    expect(policy!.violations).toBe(3)

    unmount()
  })

  // ── 11. Cache: saves to localStorage ───────────────────────────────────

  it('saves completed statuses to localStorage cache', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'cached-cluster', reachable: true }]

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      switch (callIdx) {
        case 1: return Promise.resolve(kubectlOk('crd/clusterpolicies.kyverno.io'))
        case 2: return Promise.resolve(kubectlOk(JSON.stringify({ items: [] })))
        case 3: return Promise.resolve(kubectlOk(JSON.stringify({ items: [] })))
        case 4: return Promise.resolve(kubectlOk(JSON.stringify({ items: [] })))
        case 5: return Promise.resolve(kubectlOk(JSON.stringify({ items: [] })))
        default: return Promise.resolve(kubectlFail())
      }
    })

    const { result, unmount } = renderHook(() => useKyverno())

    await waitFor(() => {
      expect(result.current.lastRefresh).not.toBeNull()
    })

    const cachedStr = localStorage.getItem(STORAGE_KEY_KYVERNO_CACHE)
    expect(cachedStr).not.toBeNull()
    const cached = JSON.parse(cachedStr!)
    expect(cached).toHaveProperty('cached-cluster')

    const cacheTime = localStorage.getItem(STORAGE_KEY_KYVERNO_CACHE_TIME)
    expect(cacheTime).not.toBeNull()

    unmount()
  })

  // ── 12. Cache: loads from localStorage on mount ────────────────────────

  it('loads cached data on mount and skips initial loading state', () => {
    const cachedStatuses = {
      'pre-cached': {
        cluster: 'pre-cached',
        installed: true,
        loading: false,
        policies: [],
        reports: [],
        totalPolicies: 5,
        totalViolations: 3,
        enforcingCount: 2,
        auditCount: 3,
      },
    }
    const cacheTimestamp = Date.now() - 30_000
    localStorage.setItem(STORAGE_KEY_KYVERNO_CACHE, JSON.stringify(cachedStatuses))
    localStorage.setItem(STORAGE_KEY_KYVERNO_CACHE_TIME, cacheTimestamp.toString())

    const { result, unmount } = renderHook(() => useKyverno())

    // Cached data is loaded synchronously via useRef(loadFromCache())
    expect(result.current.isLoading).toBe(false)
    expect(result.current.statuses).toHaveProperty('pre-cached')
    expect(result.current.lastRefresh).toBeInstanceOf(Date)

    unmount()
  })

  // ── 13. Auto-refresh interval ──────────────────────────────────────────

  it('sets up auto-refresh interval for reachable clusters and clears on unmount', () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'auto-ref', reachable: true }]
    mockExec.mockResolvedValue(kubectlFail())

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const { unmount } = renderHook(() => useKyverno())

    expect(setIntervalSpy).toHaveBeenCalled()

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  it('does NOT set up polling auto-refresh in demo mode', () => {
    mockDemoMode = true
    mockAllClusters = []

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    const { unmount } = renderHook(() => useKyverno())

    // The polling useEffect returns early in demo mode
    /** Refresh interval = 120 000 ms */
    const REFRESH_INTERVAL_MS = 120_000
    const pollingCalls = setIntervalSpy.mock.calls.filter(
      call => call[1] === REFRESH_INTERVAL_MS,
    )
    expect(pollingCalls).toHaveLength(0)

    unmount()
  })

  // ── 14. Mode transition registration ───────────────────────────────────

  it('registers and unregisters cache reset and refetch on mount/unmount', () => {
    const { unmount } = renderHook(() => useKyverno())

    expect(registerCacheReset).toHaveBeenCalledWith('kyverno', expect.any(Function))
    expect(registerRefetch).toHaveBeenCalledWith('kyverno', expect.any(Function))

    unmount()

    expect(unregisterCacheReset).toHaveBeenCalledWith('kyverno')
  })

  // ── 15. Error handling ─────────────────────────────────────────────────

  it('handles kubectlProxy.exec rejection gracefully and sets hasErrors', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'err-cluster', reachable: true }]

    mockExec.mockRejectedValue(new Error('Connection refused'))

    const { result, unmount } = renderHook(() => useKyverno())

    await waitFor(() => {
      expect(result.current.lastRefresh).not.toBeNull()
    })

    const status = result.current.statuses['err-cluster']
    expect(status).toBeDefined()
    expect(status.installed).toBe(false)
    expect(status.error).toBe('Connection refused')
    expect(result.current.hasErrors).toBe(true)

    unmount()
  })

  // ── 16. Filters out unreachable clusters ───────────────────────────────

  it('only processes reachable clusters', async () => {
    mockDemoMode = false
    mockAllClusters = [
      { name: 'reachable', reachable: true },
      { name: 'unreachable', reachable: false },
    ]
    mockExec.mockResolvedValue(kubectlFail())

    const { result, unmount } = renderHook(() => useKyverno())

    await waitFor(() => {
      expect(result.current.lastRefresh).not.toBeNull()
    })

    expect(result.current.totalClusters).toBe(1)
    expect(result.current.statuses).toHaveProperty('reachable')
    expect(result.current.statuses).not.toHaveProperty('unreachable')

    unmount()
  })

  // ── 17. ClusterPolicy fetch failure returns error status ───────────────

  it('returns error when CRD exists but ClusterPolicies fetch fails', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'fetch-fail', reachable: true }]

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      if (callIdx === 1) return Promise.resolve(kubectlOk('crd/clusterpolicies.kyverno.io'))
      if (callIdx === 2) return Promise.resolve(kubectlFail('forbidden'))
      return Promise.resolve(kubectlFail())
    })

    const { result, unmount } = renderHook(() => useKyverno())

    await waitFor(() => {
      expect(result.current.lastRefresh).not.toBeNull()
    })

    const status = result.current.statuses['fetch-fail']
    expect(status).toBeDefined()
    expect(status.installed).toBe(true)
    expect(status.error).toBe('forbidden')

    unmount()
  })

  // ── 18. Default category and description when annotations missing ──────

  it('defaults category to "Other" when annotations are missing', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'no-annot', reachable: true }]

    const cpData = {
      items: [
        {
          metadata: { name: 'plain-policy' },
          spec: {},
        },
      ],
    }

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      switch (callIdx) {
        case 1: return Promise.resolve(kubectlOk('crd/clusterpolicies.kyverno.io'))
        case 2: return Promise.resolve(kubectlOk(JSON.stringify(cpData)))
        case 3: return Promise.resolve(kubectlOk(JSON.stringify({ items: [] })))
        case 4: return Promise.resolve(kubectlOk(JSON.stringify({ items: [] })))
        case 5: return Promise.resolve(kubectlOk(JSON.stringify({ items: [] })))
        default: return Promise.resolve(kubectlFail())
      }
    })

    const { result, unmount } = renderHook(() => useKyverno())

    await waitFor(() => {
      expect(result.current.lastRefresh).not.toBeNull()
    })

    const status = result.current.statuses['no-annot']
    expect(status.policies[0].category).toBe('Other')
    expect(status.policies[0].description).toBe('')
    // Default validationFailureAction is Audit
    expect(status.policies[0].status).toBe('audit')
    // Default background is true (spec.background !== false)
    expect(status.policies[0].background).toBe(true)

    unmount()
  })
})
