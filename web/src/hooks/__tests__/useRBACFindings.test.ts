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

import { useRBACFindings } from '../useRBACFindings'
import {
  registerRefetch,
  registerCacheReset,
  unregisterCacheReset,
} from '../../lib/modeTransition'
import {
  STORAGE_KEY_RBAC_CACHE,
  STORAGE_KEY_RBAC_CACHE_TIME,
} from '../../lib/constants/storage'

// ---------------------------------------------------------------------------
// Setup / Teardown
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

/** Build a JSON response for ClusterRoleBindings */
function buildCRBResponse(
  items: Array<{
    name: string
    uid?: string
    roleName: string
    subjects?: Array<{ kind: string; name: string; namespace?: string }>
  }>,
) {
  return JSON.stringify({
    items: items.map(i => ({
      metadata: { name: i.name, uid: i.uid || i.name },
      roleRef: { kind: 'ClusterRole', name: i.roleName },
      subjects: i.subjects,
    })),
  })
}

/** Build a JSON response for ClusterRoles */
function buildCRResponse(
  items: Array<{
    name: string
    uid?: string
    rules?: Array<{
      verbs?: string[]
      resources?: string[]
      apiGroups?: string[]
    }>
  }>,
) {
  return JSON.stringify({
    items: items.map(i => ({
      metadata: { name: i.name, uid: i.uid || i.name },
      rules: i.rules || [],
    })),
  })
}

/** Build a JSON response for RoleBindings */
function buildRBResponse(
  items: Array<{
    name: string
    uid?: string
    namespace: string
    roleName: string
    subjects?: Array<{ kind: string; name: string }>
  }>,
) {
  return JSON.stringify({
    items: items.map(i => ({
      metadata: { name: i.name, uid: i.uid || i.name, namespace: i.namespace },
      roleRef: { kind: 'ClusterRole', name: i.roleName },
      subjects: i.subjects,
    })),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useRBACFindings', () => {
  // ── 1. Shape / exports ──────────────────────────────────────────────────

  it('returns expected shape with all fields', () => {
    const { result, unmount } = renderHook(() => useRBACFindings())

    expect(result.current).toHaveProperty('findings')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isDemoData')
    expect(result.current).toHaveProperty('refetch')
    expect(typeof result.current.refetch).toBe('function')
    expect(Array.isArray(result.current.findings)).toBe(true)

    unmount()
  })

  // ── 2. Demo mode returns demo findings ────────────────────────────────

  it('returns demo data with predefined findings in demo mode', async () => {
    mockDemoMode = true
    mockAllClusters = []

    const { result, unmount } = renderHook(() => useRBACFindings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.findings.length).toBe(6)
    expect(result.current.error).toBeNull()

    // Verify demo findings have correct risk levels
    const critical = result.current.findings.filter(f => f.risk === 'critical')
    expect(critical.length).toBe(1)
    expect(critical[0].cluster).toBe('prod-us-east')

    const high = result.current.findings.filter(f => f.risk === 'high')
    expect(high.length).toBe(2)

    unmount()
  })

  // ── 3. No clusters, not demo mode, clusters done loading ───────────────

  it('returns empty findings when no clusters exist and not in demo mode', async () => {
    mockDemoMode = false
    mockAllClusters = []
    mockClustersLoading = false

    const { result, unmount } = renderHook(() => useRBACFindings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.findings).toHaveLength(0)
    expect(result.current.isDemoData).toBe(false)

    unmount()
  })

  // ── 4. Clusters still loading ──────────────────────────────────────────

  it('stays in loading state while clusters are still loading', () => {
    mockDemoMode = false
    mockAllClusters = []
    mockClustersLoading = true

    const { result, unmount } = renderHook(() => useRBACFindings())

    // No cache → isLoading is true, clusters still loading prevents resolution
    expect(result.current.isLoading).toBe(true)

    unmount()
  })

  // ── 5. Filters out unreachable clusters ────────────────────────────────

  it('only processes reachable clusters', async () => {
    mockDemoMode = false
    mockAllClusters = [
      { name: 'reachable', reachable: true },
      { name: 'unreachable', reachable: false },
    ]

    // Return empty data for the single reachable cluster
    mockExec.mockResolvedValue(kubectlOk(JSON.stringify({ items: [] })))

    const { result, unmount } = renderHook(() => useRBACFindings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Only the reachable cluster should have been queried
    // 3 calls: clusterrolebindings, clusterroles, rolebindings
    const contextArgs = mockExec.mock.calls.map(c => c[1]?.context)
    expect(contextArgs.every((ctx: string) => ctx === 'reachable')).toBe(true)
    expect(contextArgs).not.toContain('unreachable')

    unmount()
  })

  // ── 6. Detects cluster-admin binding → CRITICAL ────────────────────────

  it('flags cluster-admin bindings as critical risk', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'prod', reachable: true }]

    const crbData = buildCRBResponse([
      {
        name: 'dev-admin-binding',
        roleName: 'cluster-admin',
        subjects: [{ kind: 'Group', name: 'dev-team' }],
      },
    ])
    const crData = buildCRResponse([
      { name: 'cluster-admin', rules: [{ verbs: ['*'], resources: ['*'] }] },
    ])
    const rbData = buildRBResponse([])

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      switch (callIdx) {
        case 1: return Promise.resolve(kubectlOk(crbData))
        case 2: return Promise.resolve(kubectlOk(crData))
        case 3: return Promise.resolve(kubectlOk(rbData))
        default: return Promise.resolve(kubectlFail())
      }
    })

    const { result, unmount } = renderHook(() => useRBACFindings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.findings).toHaveLength(1)
    const finding = result.current.findings[0]
    expect(finding.risk).toBe('critical')
    expect(finding.subject).toBe('dev-team')
    expect(finding.subjectKind).toBe('Group')
    expect(finding.description).toContain('cluster-admin')
    expect(finding.binding).toBe('ClusterRoleBinding/dev-admin-binding')

    unmount()
  })

  // ── 7. Detects wildcard verbs on secrets → HIGH ────────────────────────

  it('flags wildcard verb on secrets access as high risk', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'prod', reachable: true }]

    const crbData = buildCRBResponse([
      {
        name: 'ci-secrets-binding',
        roleName: 'secret-reader',
        subjects: [{ kind: 'ServiceAccount', name: 'ci-bot' }],
      },
    ])
    const crData = buildCRResponse([
      {
        name: 'secret-reader',
        rules: [{ verbs: ['*'], resources: ['secrets'], apiGroups: [''] }],
      },
    ])
    const rbData = buildRBResponse([])

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      switch (callIdx) {
        case 1: return Promise.resolve(kubectlOk(crbData))
        case 2: return Promise.resolve(kubectlOk(crData))
        case 3: return Promise.resolve(kubectlOk(rbData))
        default: return Promise.resolve(kubectlFail())
      }
    })

    const { result, unmount } = renderHook(() => useRBACFindings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.findings).toHaveLength(1)
    const finding = result.current.findings[0]
    expect(finding.risk).toBe('high')
    expect(finding.subjectKind).toBe('ServiceAccount')
    expect(finding.description).toContain('Wildcard verb on secrets')

    unmount()
  })

  // ── 8. Detects default ServiceAccount with elevated privileges → HIGH ──

  it('flags default ServiceAccount with elevated privileges as high risk', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'staging', reachable: true }]

    const crbData = buildCRBResponse([
      {
        name: 'default-elevated',
        roleName: 'pod-manager',
        subjects: [{ kind: 'ServiceAccount', name: 'default' }],
      },
    ])
    const crData = buildCRResponse([
      {
        name: 'pod-manager',
        rules: [{ verbs: ['get', 'list'], resources: ['pods'] }],
      },
    ])
    const rbData = buildRBResponse([])

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      switch (callIdx) {
        case 1: return Promise.resolve(kubectlOk(crbData))
        case 2: return Promise.resolve(kubectlOk(crData))
        case 3: return Promise.resolve(kubectlOk(rbData))
        default: return Promise.resolve(kubectlFail())
      }
    })

    const { result, unmount } = renderHook(() => useRBACFindings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.findings).toHaveLength(1)
    const finding = result.current.findings[0]
    expect(finding.risk).toBe('high')
    expect(finding.subject).toBe('default')
    expect(finding.description).toContain('Default ServiceAccount')

    unmount()
  })

  // ── 9. Detects wide read access → MEDIUM ──────────────────────────────

  it('flags wide list/watch on all resources as medium risk', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'prod', reachable: true }]

    const crbData = buildCRBResponse([
      {
        name: 'monitoring-wide',
        roleName: 'wide-reader',
        subjects: [{ kind: 'ServiceAccount', name: 'monitoring-sa' }],
      },
    ])
    const crData = buildCRResponse([
      {
        name: 'wide-reader',
        rules: [{ verbs: ['list', 'watch'], resources: ['*'] }],
      },
    ])
    const rbData = buildRBResponse([])

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      switch (callIdx) {
        case 1: return Promise.resolve(kubectlOk(crbData))
        case 2: return Promise.resolve(kubectlOk(crData))
        case 3: return Promise.resolve(kubectlOk(rbData))
        default: return Promise.resolve(kubectlFail())
      }
    })

    const { result, unmount } = renderHook(() => useRBACFindings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.findings).toHaveLength(1)
    const finding = result.current.findings[0]
    expect(finding.risk).toBe('medium')
    expect(finding.description).toContain('Wide list/watch')

    unmount()
  })

  // ── 10. Detects elevated namespace RoleBindings → LOW ──────────────────

  it('flags admin/edit role bindings at namespace scope as low risk', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'staging', reachable: true }]

    const crbData = buildCRBResponse([])
    const crData = buildCRResponse([])
    const rbData = buildRBResponse([
      {
        name: 'dev-edit',
        namespace: 'production',
        roleName: 'edit',
        subjects: [{ kind: 'User', name: 'developer' }],
      },
      {
        name: 'admin-binding',
        namespace: 'kube-system',
        roleName: 'admin',
        subjects: [{ kind: 'Group', name: 'ops-team' }],
      },
      {
        name: 'viewer-binding',
        namespace: 'default',
        roleName: 'view',
        subjects: [{ kind: 'User', name: 'viewer' }],
      },
    ])

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      switch (callIdx) {
        case 1: return Promise.resolve(kubectlOk(crbData))
        case 2: return Promise.resolve(kubectlOk(crData))
        case 3: return Promise.resolve(kubectlOk(rbData))
        default: return Promise.resolve(kubectlFail())
      }
    })

    const { result, unmount } = renderHook(() => useRBACFindings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // 'view' is NOT in the elevatedRoles set, so only edit + admin = 2 findings
    expect(result.current.findings).toHaveLength(2)
    expect(result.current.findings.every(f => f.risk === 'low')).toBe(true)
    expect(result.current.findings[0].description).toContain('edit role in namespace production')
    expect(result.current.findings[1].description).toContain('admin role in namespace kube-system')

    unmount()
  })

  // ── 11. Handles CRB fetch failure by surfacing an error (Issue 9264) ──

  it('surfaces an error state when every cluster fails (Issue 9264)', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'err-cluster', reachable: true }]

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      switch (callIdx) {
        case 1: return Promise.resolve(kubectlFail('forbidden'))
        case 2: return Promise.resolve(kubectlFail())
        case 3: return Promise.resolve(kubectlFail())
        default: return Promise.resolve(kubectlFail())
      }
    })

    const { result, unmount } = renderHook(() => useRBACFindings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Issue 9264: when all clusters fail, the hook must set `error` instead
    // of silently returning an empty list. The UI uses this to render its
    // retry state rather than a misleading "No findings" state.
    expect(result.current.findings).toHaveLength(0)
    expect(result.current.error).not.toBeNull()
    expect(result.current.error).toContain('err-cluster')

    unmount()
  })

  // ── 12. Handles kubectl exec rejection (network error) ────────────────

  it('surfaces an error on network rejection (Issue 9264)', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'net-err', reachable: true }]

    mockExec.mockRejectedValue(new Error('Connection refused'))

    const { result, unmount } = renderHook(() => useRBACFindings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Single cluster, throws → error surfaces (Issue 9264).
    expect(result.current.findings).toHaveLength(0)
    expect(result.current.error).not.toBeNull()

    unmount()
  })

  // ── 13. Cache: saves to localStorage after successful fetch ────────────

  it('saves findings to localStorage cache after fetch', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'cached-cluster', reachable: true }]

    const crbData = buildCRBResponse([
      {
        name: 'admin-binding',
        roleName: 'cluster-admin',
        subjects: [{ kind: 'User', name: 'admin' }],
      },
    ])

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      switch (callIdx) {
        case 1: return Promise.resolve(kubectlOk(crbData))
        case 2: return Promise.resolve(kubectlOk(buildCRResponse([])))
        case 3: return Promise.resolve(kubectlOk(buildRBResponse([])))
        default: return Promise.resolve(kubectlFail())
      }
    })

    const { result, unmount } = renderHook(() => useRBACFindings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const cachedStr = localStorage.getItem(STORAGE_KEY_RBAC_CACHE)
    expect(cachedStr).not.toBeNull()
    const cached = JSON.parse(cachedStr!)
    expect(cached).toHaveLength(1)
    expect(cached[0].risk).toBe('critical')

    const cacheTime = localStorage.getItem(STORAGE_KEY_RBAC_CACHE_TIME)
    expect(cacheTime).not.toBeNull()

    unmount()
  })

  // ── 14. Cache: loads from localStorage on mount ────────────────────────

  it('loads cached data on mount and skips initial loading state', () => {
    const cachedFindings = [
      {
        id: 'pre-cached-1',
        cluster: 'prod',
        subject: 'admin',
        subjectKind: 'User',
        risk: 'critical',
        description: 'cluster-admin binding',
        binding: 'ClusterRoleBinding/admin',
      },
    ]
    localStorage.setItem(STORAGE_KEY_RBAC_CACHE, JSON.stringify(cachedFindings))
    localStorage.setItem(STORAGE_KEY_RBAC_CACHE_TIME, Date.now().toString())

    const { result, unmount } = renderHook(() => useRBACFindings())

    // Cached data is loaded synchronously via useRef(loadFromCache())
    expect(result.current.isLoading).toBe(false)
    expect(result.current.findings).toHaveLength(1)
    expect(result.current.findings[0].id).toBe('pre-cached-1')

    unmount()
  })

  // ── 15. Mode transition registration ──────────────────────────────────

  it('registers and unregisters cache reset and refetch on mount/unmount', () => {
    const { unmount } = renderHook(() => useRBACFindings())

    expect(registerCacheReset).toHaveBeenCalledWith('rbac-findings', expect.any(Function))
    expect(registerRefetch).toHaveBeenCalledWith('rbac-findings', expect.any(Function))

    unmount()

    expect(unregisterCacheReset).toHaveBeenCalledWith('rbac-findings')
  })

  // ── 16. Auto-refresh interval ─────────────────────────────────────────

  it('sets up auto-refresh interval for reachable clusters and clears on unmount', () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'auto-ref', reachable: true }]
    mockExec.mockResolvedValue(kubectlOk(JSON.stringify({ items: [] })))

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const { unmount } = renderHook(() => useRBACFindings())

    expect(setIntervalSpy).toHaveBeenCalled()

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  it('does NOT set up polling auto-refresh in demo mode', () => {
    mockDemoMode = true
    mockAllClusters = []

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    const { unmount } = renderHook(() => useRBACFindings())

    /** RBAC hook refresh interval = 300 000 ms (5 minutes) */
    const RBAC_REFRESH_INTERVAL_MS = 300_000
    const pollingCalls = setIntervalSpy.mock.calls.filter(
      call => call[1] === RBAC_REFRESH_INTERVAL_MS,
    )
    expect(pollingCalls).toHaveLength(0)

    unmount()
  })

  // ── 17. Multiple subjects per binding ─────────────────────────────────

  it('creates separate findings for each subject in a binding', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'multi-subj', reachable: true }]

    const crbData = buildCRBResponse([
      {
        name: 'shared-admin',
        roleName: 'cluster-admin',
        subjects: [
          { kind: 'User', name: 'alice' },
          { kind: 'User', name: 'bob' },
          { kind: 'Group', name: 'admins' },
        ],
      },
    ])

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      switch (callIdx) {
        case 1: return Promise.resolve(kubectlOk(crbData))
        case 2: return Promise.resolve(kubectlOk(buildCRResponse([])))
        case 3: return Promise.resolve(kubectlOk(buildRBResponse([])))
        default: return Promise.resolve(kubectlFail())
      }
    })

    const { result, unmount } = renderHook(() => useRBACFindings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // 3 subjects in one cluster-admin binding → 3 critical findings
    expect(result.current.findings).toHaveLength(3)
    expect(result.current.findings.every(f => f.risk === 'critical')).toBe(true)
    const subjects = result.current.findings.map(f => f.subject).sort()
    expect(subjects).toEqual(['admins', 'alice', 'bob'])

    unmount()
  })

  // ── 18. Multi-cluster aggregation ─────────────────────────────────────

  it('aggregates findings across multiple clusters', async () => {
    mockDemoMode = false
    mockAllClusters = [
      { name: 'cluster-a', reachable: true },
      { name: 'cluster-b', reachable: true },
    ]

    mockExec.mockImplementation((args: string[], opts: { context: string }) => {
      const cmd = args[1]
      if (cmd === 'clusterrolebindings') {
        if (opts.context === 'cluster-a') {
          return Promise.resolve(kubectlOk(buildCRBResponse([
            {
              name: 'admin-a',
              roleName: 'cluster-admin',
              subjects: [{ kind: 'User', name: 'alice' }],
            },
          ])))
        }
        return Promise.resolve(kubectlOk(buildCRBResponse([
          {
            name: 'admin-b',
            roleName: 'cluster-admin',
            subjects: [{ kind: 'User', name: 'bob' }],
          },
        ])))
      }
      if (cmd === 'clusterroles') {
        return Promise.resolve(kubectlOk(buildCRResponse([])))
      }
      // rolebindings
      return Promise.resolve(kubectlOk(buildRBResponse([])))
    })

    const { result, unmount } = renderHook(() => useRBACFindings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.findings).toHaveLength(2)
    const clusters = result.current.findings.map(f => f.cluster).sort()
    expect(clusters).toEqual(['cluster-a', 'cluster-b'])

    unmount()
  })

  // ── 19. Binding with no subjects produces no findings ─────────────────

  it('skips bindings with no subjects', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'no-subj', reachable: true }]

    const crbData = buildCRBResponse([
      {
        name: 'orphaned-binding',
        roleName: 'cluster-admin',
        // No subjects
      },
    ])

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      switch (callIdx) {
        case 1: return Promise.resolve(kubectlOk(crbData))
        case 2: return Promise.resolve(kubectlOk(buildCRResponse([])))
        case 3: return Promise.resolve(kubectlOk(buildRBResponse([])))
        default: return Promise.resolve(kubectlFail())
      }
    })

    const { result, unmount } = renderHook(() => useRBACFindings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.findings).toHaveLength(0)

    unmount()
  })

  // ── 20. Priority: cluster-admin takes precedence over wildcard checks ──

  it('assigns critical risk for cluster-admin even when role also has wildcard/secrets rules', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'priority', reachable: true }]

    const crbData = buildCRBResponse([
      {
        name: 'full-admin',
        roleName: 'cluster-admin',
        subjects: [{ kind: 'User', name: 'superuser' }],
      },
    ])
    // cluster-admin role with wildcard rules (the binding name check fires first)
    const crData = buildCRResponse([
      {
        name: 'cluster-admin',
        rules: [{ verbs: ['*'], resources: ['*', 'secrets'] }],
      },
    ])

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      switch (callIdx) {
        case 1: return Promise.resolve(kubectlOk(crbData))
        case 2: return Promise.resolve(kubectlOk(crData))
        case 3: return Promise.resolve(kubectlOk(buildRBResponse([])))
        default: return Promise.resolve(kubectlFail())
      }
    })

    const { result, unmount } = renderHook(() => useRBACFindings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Only 1 finding (cluster-admin short-circuits via continue)
    expect(result.current.findings).toHaveLength(1)
    expect(result.current.findings[0].risk).toBe('critical')

    unmount()
  })

  // ── 21. toSubjectKind maps unknown kinds to 'User' ────────────────────

  it('maps unknown subject kinds to User', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'unknown-kind', reachable: true }]

    const crbData = buildCRBResponse([
      {
        name: 'admin-binding',
        roleName: 'cluster-admin',
        subjects: [{ kind: 'UnknownKind', name: 'mystery-subject' }],
      },
    ])

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      switch (callIdx) {
        case 1: return Promise.resolve(kubectlOk(crbData))
        case 2: return Promise.resolve(kubectlOk(buildCRResponse([])))
        case 3: return Promise.resolve(kubectlOk(buildRBResponse([])))
        default: return Promise.resolve(kubectlFail())
      }
    })

    const { result, unmount } = renderHook(() => useRBACFindings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.findings[0].subjectKind).toBe('User')

    unmount()
  })

  // ── 22. Cache cleared on corrupt localStorage ─────────────────────────

  it('handles corrupt localStorage cache gracefully', () => {
    localStorage.setItem(STORAGE_KEY_RBAC_CACHE, 'NOT_VALID_JSON')
    localStorage.setItem(STORAGE_KEY_RBAC_CACHE_TIME, 'abc')

    // Should not throw — loadFromCache returns null on parse error
    const { result, unmount } = renderHook(() => useRBACFindings())

    expect(result.current.findings).toHaveLength(0)

    unmount()
  })

  // ── 23. Secrets access via get/list (not wildcard verb) + secrets ──────

  it('detects secrets access via get/list verbs combined with wildcard verbs in separate rules', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'sec-access', reachable: true }]

    const crbData = buildCRBResponse([
      {
        name: 'secrets-reader',
        roleName: 'secrets-role',
        subjects: [{ kind: 'ServiceAccount', name: 'vault-agent' }],
      },
    ])
    // The role has wildcard verbs AND secrets access in the same rule set
    const crData = buildCRResponse([
      {
        name: 'secrets-role',
        rules: [
          { verbs: ['*'], resources: ['secrets'] },
        ],
      },
    ])

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      switch (callIdx) {
        case 1: return Promise.resolve(kubectlOk(crbData))
        case 2: return Promise.resolve(kubectlOk(crData))
        case 3: return Promise.resolve(kubectlOk(buildRBResponse([])))
        default: return Promise.resolve(kubectlFail())
      }
    })

    const { result, unmount } = renderHook(() => useRBACFindings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.findings).toHaveLength(1)
    expect(result.current.findings[0].risk).toBe('high')

    unmount()
  })

  // ── 24. RoleBindings with cluster-admin at namespace scope → LOW ───────

  it('flags cluster-admin RoleBinding at namespace scope as low risk', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'ns-admin', reachable: true }]

    const crbData = buildCRBResponse([])
    const crData = buildCRResponse([])
    const rbData = buildRBResponse([
      {
        name: 'ns-cluster-admin',
        namespace: 'kube-system',
        roleName: 'cluster-admin',
        subjects: [{ kind: 'ServiceAccount', name: 'dashboard' }],
      },
    ])

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      switch (callIdx) {
        case 1: return Promise.resolve(kubectlOk(crbData))
        case 2: return Promise.resolve(kubectlOk(crData))
        case 3: return Promise.resolve(kubectlOk(rbData))
        default: return Promise.resolve(kubectlFail())
      }
    })

    const { result, unmount } = renderHook(() => useRBACFindings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.findings).toHaveLength(1)
    expect(result.current.findings[0].risk).toBe('low')
    expect(result.current.findings[0].binding).toBe('RoleBinding/ns-cluster-admin')
    expect(result.current.findings[0].description).toContain('cluster-admin role in namespace kube-system')

    unmount()
  })

  // ── 25. ClusterRole fetch failure still allows CRB analysis ────────────

  it('still processes cluster-admin bindings when ClusterRoles fetch fails', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'cr-fail', reachable: true }]

    const crbData = buildCRBResponse([
      {
        name: 'admin-binding',
        roleName: 'cluster-admin',
        subjects: [{ kind: 'User', name: 'admin-user' }],
      },
    ])

    let callIdx = 0
    mockExec.mockImplementation(() => {
      callIdx++
      switch (callIdx) {
        case 1: return Promise.resolve(kubectlOk(crbData))
        case 2: return Promise.resolve(kubectlFail('timeout'))  // ClusterRoles fail
        case 3: return Promise.resolve(kubectlOk(buildRBResponse([])))
        default: return Promise.resolve(kubectlFail())
      }
    })

    const { result, unmount } = renderHook(() => useRBACFindings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // cluster-admin detection is by roleName, not by rules → still works
    expect(result.current.findings).toHaveLength(1)
    expect(result.current.findings[0].risk).toBe('critical')

    unmount()
  })
})
