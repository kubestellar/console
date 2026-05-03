import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock control variables -- toggled from individual tests
// ---------------------------------------------------------------------------

let mockDemoMode = false
let mockClustersLoading = false
let mockAllClusters: Array<{ name: string; reachable?: boolean }> = []
let mockCertStatus = {
  installed: false,
  totalCertificates: 0,
  validCertificates: 0,
  expiringSoon: 0,
  expired: 0,
}
let mockCertLoading = false
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

vi.mock('../useCertManager', () => ({
  useCertManager: () => ({
    status: mockCertStatus,
    isLoading: mockCertLoading,
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

import { useDataCompliance } from '../useDataCompliance'
import {
  registerRefetch,
  registerCacheReset,
  unregisterCacheReset,
} from '../../lib/modeTransition'

/** sessionStorage cache key used by the hook */
const CACHE_KEY = 'kc-data-compliance-cache'

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  sessionStorage.clear()
  mockDemoMode = false
  mockClustersLoading = false
  mockAllClusters = []
  mockCertStatus = {
    installed: false,
    totalCertificates: 0,
    validCertificates: 0,
    expiringSoon: 0,
    expired: 0,
  }
  mockCertLoading = false
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

/**
 * Set up mockExec to handle the standard 4-call pattern for a single cluster:
 *   1. secrets (jsonpath — returns one type per line)
 *   2. roles,clusterroles (jsonpath — returns one '1' per role)
 *   3. clusterrolebindings (JSON with items)
 *   4. rolebindings (jsonpath — returns one '1' per binding)
 *   5. namespaces (jsonpath — returns one '1' per namespace)
 */
function setupSingleClusterExec(opts: {
  secretTypes?: string[]
  roleCount?: number
  clusterRoleBindingsJson?: string
  roleBindingCount?: number
  namespaceCount?: number
}) {
  const {
    secretTypes = [],
    roleCount = 0,
    clusterRoleBindingsJson = JSON.stringify({ items: [] }),
    roleBindingCount = 0,
    namespaceCount = 0,
  } = opts

  let _callIdx = 0
  mockExec.mockImplementation((args: string[]) => {
    _callIdx++
    const cmd = args.join(' ')

    // secrets
    if (cmd.includes('secrets')) {
      return Promise.resolve(kubectlOk(secretTypes.join('\n')))
    }
    // roles,clusterroles
    if (cmd.includes('roles,clusterroles')) {
      return Promise.resolve(kubectlOk('1'.repeat(roleCount)))
    }
    // clusterrolebindings
    if (cmd.includes('clusterrolebindings')) {
      return Promise.resolve(kubectlOk(clusterRoleBindingsJson))
    }
    // rolebindings
    if (cmd.includes('rolebindings')) {
      return Promise.resolve(kubectlOk('1'.repeat(roleBindingCount)))
    }
    // namespaces
    if (cmd.includes('namespaces')) {
      return Promise.resolve(kubectlOk('1'.repeat(namespaceCount)))
    }

    return Promise.resolve(kubectlFail())
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDataCompliance', () => {
  // ── 1. Shape / exports ──────────────────────────────────────────────────

  it('returns expected shape with all fields', () => {
    mockDemoMode = true

    const { result, unmount } = renderHook(() => useDataCompliance())

    expect(result.current).toHaveProperty('posture')
    expect(result.current).toHaveProperty('scores')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isDemoData')
    expect(result.current).toHaveProperty('refetch')
    expect(typeof result.current.refetch).toBe('function')

    // Posture sub-fields
    expect(result.current.posture).toHaveProperty('totalSecrets')
    expect(result.current.posture).toHaveProperty('opaqueSecrets')
    expect(result.current.posture).toHaveProperty('tlsSecrets')
    expect(result.current.posture).toHaveProperty('saTokenSecrets')
    expect(result.current.posture).toHaveProperty('dockerSecrets')
    expect(result.current.posture).toHaveProperty('rbacPolicies')
    expect(result.current.posture).toHaveProperty('roleBindings')
    expect(result.current.posture).toHaveProperty('clusterAdminBindings')
    expect(result.current.posture).toHaveProperty('certManagerInstalled')
    expect(result.current.posture).toHaveProperty('totalCertificates')
    expect(result.current.posture).toHaveProperty('totalNamespaces')
    expect(result.current.posture).toHaveProperty('totalClusters')
    expect(result.current.posture).toHaveProperty('reachableClusters')

    // Scores sub-fields
    expect(result.current.scores).toHaveProperty('encryptionScore')
    expect(result.current.scores).toHaveProperty('rbacScore')
    expect(result.current.scores).toHaveProperty('certScore')
    expect(result.current.scores).toHaveProperty('overallScore')

    unmount()
  })

  // ── 2. Demo mode returns demo posture ─────────────────────────────────

  it('returns demo posture data in demo mode', async () => {
    mockDemoMode = true
    mockAllClusters = []

    const { result, unmount } = renderHook(() => useDataCompliance())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.posture.totalSecrets).toBe(164)
    expect(result.current.posture.opaqueSecrets).toBe(8)
    expect(result.current.posture.tlsSecrets).toBe(12)
    expect(result.current.posture.saTokenSecrets).toBe(120)
    expect(result.current.posture.dockerSecrets).toBe(4)
    expect(result.current.posture.rbacPolicies).toBe(48)
    expect(result.current.posture.roleBindings).toBe(32)
    expect(result.current.posture.clusterAdminBindings).toBe(6)
    expect(result.current.posture.certManagerInstalled).toBe(true)
    expect(result.current.posture.totalClusters).toBe(3)
    expect(result.current.error).toBeNull()

    unmount()
  })

  // ── 3. No clusters, not demo mode, clusters done loading ───────────────

  it('sets isLoading to false when no clusters exist and not in demo mode', async () => {
    mockDemoMode = false
    mockAllClusters = []
    mockClustersLoading = false

    const { result, unmount } = renderHook(() => useDataCompliance())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    unmount()
  })

  // ── 4. Clusters still loading ──────────────────────────────────────────

  it('stays in loading state while clusters are still loading', () => {
    mockDemoMode = false
    mockAllClusters = []
    mockClustersLoading = true

    const { result, unmount } = renderHook(() => useDataCompliance())

    // No cache → isLoading is true
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

    setupSingleClusterExec({})

    const { result, unmount } = renderHook(() => useDataCompliance())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Verify only reachable cluster was queried
    const contextArgs = mockExec.mock.calls.map(c => c[1]?.context)
    expect(contextArgs.every((ctx: string) => ctx === 'reachable')).toBe(true)

    // reachableClusters should be 1, totalClusters should be 2
    expect(result.current.posture.reachableClusters).toBe(1)
    expect(result.current.posture.totalClusters).toBe(2)

    unmount()
  })

  // ── 6. Correctly counts secret types ──────────────────────────────────

  it('counts secret types correctly from kubectl output', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'sec-cluster', reachable: true }]

    setupSingleClusterExec({
      secretTypes: [
        'Opaque',
        'Opaque',
        'Opaque',
        'kubernetes.io/tls',
        'kubernetes.io/tls',
        'kubernetes.io/service-account-token',
        'kubernetes.io/service-account-token',
        'kubernetes.io/service-account-token',
        'kubernetes.io/dockerconfigjson',
        'kubernetes.io/dockercfg',
        'some-other-type',
      ],
    })

    const { result, unmount } = renderHook(() => useDataCompliance())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.posture.totalSecrets).toBe(11)
    expect(result.current.posture.opaqueSecrets).toBe(3)
    expect(result.current.posture.tlsSecrets).toBe(2)
    expect(result.current.posture.saTokenSecrets).toBe(3)
    // dockerconfigjson + dockercfg both count as docker
    expect(result.current.posture.dockerSecrets).toBe(2)
    expect(result.current.isDemoData).toBe(false)

    unmount()
  })

  // ── 7. RBAC roles and bindings counted ────────────────────────────────

  it('counts RBAC roles and bindings correctly', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'rbac-cluster', reachable: true }]

    const clusterRoleBindings = {
      items: [
        { roleRef: { name: 'admin' } },
        { roleRef: { name: 'cluster-admin' } },
        { roleRef: { name: 'cluster-admin' } },
        { roleRef: { name: 'edit' } },
      ],
    }

    setupSingleClusterExec({
      roleCount: 15,
      clusterRoleBindingsJson: JSON.stringify(clusterRoleBindings),
      roleBindingCount: 8,
      namespaceCount: 5,
    })

    const { result, unmount } = renderHook(() => useDataCompliance())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.posture.rbacPolicies).toBe(15)
    // 4 clusterrolebindings + 8 rolebindings = 12
    expect(result.current.posture.roleBindings).toBe(12)
    // 2 bindings referencing 'cluster-admin'
    expect(result.current.posture.clusterAdminBindings).toBe(2)
    expect(result.current.posture.totalNamespaces).toBe(5)

    unmount()
  })

  // ── 8. Cert-manager data integrated from useCertManager ────────────────

  it('integrates cert-manager status from useCertManager hook', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'cert-cluster', reachable: true }]
    mockCertStatus = {
      installed: true,
      totalCertificates: 10,
      validCertificates: 7,
      expiringSoon: 2,
      expired: 1,
    }

    setupSingleClusterExec({})

    const { result, unmount } = renderHook(() => useDataCompliance())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.posture.certManagerInstalled).toBe(true)
    expect(result.current.posture.totalCertificates).toBe(10)
    expect(result.current.posture.validCertificates).toBe(7)
    expect(result.current.posture.expiringSoon).toBe(2)
    expect(result.current.posture.expiredCertificates).toBe(1)

    unmount()
  })

  // ── 9. Compliance scores calculation — encryption score ────────────────

  it('calculates encryption score based on opaque secrets ratio', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'enc-cluster', reachable: true }]

    // 2 opaque out of 10 total → (10-2)/10 * 100 = 80%
    setupSingleClusterExec({
      secretTypes: [
        'Opaque', 'Opaque',
        'kubernetes.io/tls', 'kubernetes.io/tls', 'kubernetes.io/tls', 'kubernetes.io/tls',
        'kubernetes.io/service-account-token', 'kubernetes.io/service-account-token',
        'kubernetes.io/service-account-token', 'kubernetes.io/service-account-token',
      ],
    })

    const { result, unmount } = renderHook(() => useDataCompliance())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.scores.encryptionScore).toBe(80)

    unmount()
  })

  // ── 10. Compliance scores — RBAC score with cluster-admin bindings ────

  it('penalizes RBAC score proportional to cluster-admin bindings', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'rbac-score', reachable: true }]

    // 2 cluster-admin bindings out of 10 total → 100 - (2/10)*100 = 80%
    const clusterRoleBindings = {
      items: [
        { roleRef: { name: 'cluster-admin' } },
        { roleRef: { name: 'cluster-admin' } },
        { roleRef: { name: 'view' } },
        { roleRef: { name: 'view' } },
        { roleRef: { name: 'view' } },
        { roleRef: { name: 'view' } },
        { roleRef: { name: 'view' } },
        { roleRef: { name: 'view' } },
        { roleRef: { name: 'view' } },
        { roleRef: { name: 'view' } },
      ],
    }

    setupSingleClusterExec({
      clusterRoleBindingsJson: JSON.stringify(clusterRoleBindings),
      roleBindingCount: 0,
    })

    const { result, unmount } = renderHook(() => useDataCompliance())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.scores.rbacScore).toBe(80)

    unmount()
  })

  // ── 11. Compliance scores — cert score ────────────────────────────────

  it('calculates cert score as valid/total percentage', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'cert-score', reachable: true }]
    // 3 valid out of 4 total → 75%
    mockCertStatus = {
      installed: true,
      totalCertificates: 4,
      validCertificates: 3,
      expiringSoon: 1,
      expired: 0,
    }

    setupSingleClusterExec({})

    const { result, unmount } = renderHook(() => useDataCompliance())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.scores.certScore).toBe(75)

    unmount()
  })

  // ── 12. Cert score edge case: cert-manager installed but no certs ─────

  it('returns 100 cert score when cert-manager is installed but no certs', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'no-certs', reachable: true }]
    mockCertStatus = {
      installed: true,
      totalCertificates: 0,
      validCertificates: 0,
      expiringSoon: 0,
      expired: 0,
    }

    setupSingleClusterExec({})

    const { result, unmount } = renderHook(() => useDataCompliance())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // cert-manager installed, 0 certs → 100
    expect(result.current.scores.certScore).toBe(100)

    unmount()
  })

  // ── 13. Cert score edge case: cert-manager NOT installed ──────────────

  it('returns 0 cert score when cert-manager is not installed', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'no-cm', reachable: true }]
    mockCertStatus = {
      installed: false,
      totalCertificates: 0,
      validCertificates: 0,
      expiringSoon: 0,
      expired: 0,
    }

    setupSingleClusterExec({})

    const { result, unmount } = renderHook(() => useDataCompliance())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.scores.certScore).toBe(0)

    unmount()
  })

  // ── 14. Overall score weighted average ────────────────────────────────

  it('calculates overall score as weighted average (35% enc + 35% rbac + 30% cert)', () => {
    mockDemoMode = true

    const { result, unmount } = renderHook(() => useDataCompliance())

    // Demo posture: totalSecrets=164, opaqueSecrets=8
    //   encryptionScore = round((164-8)/164 * 100) = round(95.12) = 95
    // roleBindings=32, clusterAdminBindings=6
    //   rbacScore = max(0, round(100 - (6/32)*100)) = round(81.25) = 81
    // totalCertificates=4, validCertificates=2
    //   certScore = round(2/4 * 100) = 50
    // overall = round(95*0.35 + 81*0.35 + 50*0.3) = round(33.25 + 28.35 + 15) = round(76.6) = 77
    expect(result.current.scores.encryptionScore).toBe(95)
    expect(result.current.scores.rbacScore).toBe(81)
    expect(result.current.scores.certScore).toBe(50)
    expect(result.current.scores.overallScore).toBe(77)

    unmount()
  })

  // ── 15. Encryption score = 100 when no secrets exist ──────────────────

  it('returns 100 encryption score when there are no secrets', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'empty', reachable: true }]

    setupSingleClusterExec({ secretTypes: [] })

    const { result, unmount } = renderHook(() => useDataCompliance())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.scores.encryptionScore).toBe(100)

    unmount()
  })

  // ── 16. RBAC score = 100 when no role bindings exist ──────────────────

  it('returns 100 RBAC score when there are no role bindings', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'clean', reachable: true }]

    setupSingleClusterExec({
      clusterRoleBindingsJson: JSON.stringify({ items: [] }),
      roleBindingCount: 0,
    })

    const { result, unmount } = renderHook(() => useDataCompliance())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.scores.rbacScore).toBe(100)

    unmount()
  })

  // ── 17. Cache: saves to sessionStorage after successful fetch ────────────

  it('saves compliance posture to sessionStorage cache after fetch', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'cache-cluster', reachable: true }]

    setupSingleClusterExec({
      secretTypes: ['Opaque', 'kubernetes.io/tls'],
      roleCount: 5,
      namespaceCount: 3,
    })

    const { result, unmount } = renderHook(() => useDataCompliance())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const cachedStr = sessionStorage.getItem(CACHE_KEY)
    expect(cachedStr).not.toBeNull()
    const cached = JSON.parse(cachedStr!)
    expect(cached).toHaveProperty('posture')
    expect(cached).toHaveProperty('timestamp')
    expect(cached.posture.totalSecrets).toBe(2)
    expect(cached.posture.opaqueSecrets).toBe(1)
    expect(cached.posture.tlsSecrets).toBe(1)
    expect(cached.posture.rbacPolicies).toBe(5)
    expect(cached.posture.totalNamespaces).toBe(3)

    unmount()
  })

  // ── 18. Cache: loads from sessionStorage on mount ────────────────────────

  it('loads cached data on mount and skips initial loading state', () => {
    const cachedPosture = {
      posture: {
        totalSecrets: 50,
        opaqueSecrets: 5,
        tlsSecrets: 10,
        saTokenSecrets: 30,
        dockerSecrets: 2,
        rbacPolicies: 20,
        roleBindings: 15,
        clusterAdminBindings: 3,
        certManagerInstalled: true,
        totalCertificates: 8,
        validCertificates: 6,
        expiringSoon: 1,
        expiredCertificates: 1,
        totalNamespaces: 7,
        totalClusters: 2,
        reachableClusters: 2,
      },
      timestamp: Date.now() - 30_000,
    }
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cachedPosture))

    const { result, unmount } = renderHook(() => useDataCompliance())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.posture.totalSecrets).toBe(50)
    expect(result.current.posture.opaqueSecrets).toBe(5)

    unmount()
  })

  // ── 19. Mode transition registration ──────────────────────────────────

  it('registers and unregisters cache reset and refetch on mount/unmount', () => {
    mockDemoMode = true

    const { unmount } = renderHook(() => useDataCompliance())

    expect(registerCacheReset).toHaveBeenCalledWith('data-compliance', expect.any(Function))
    expect(registerRefetch).toHaveBeenCalledWith('data-compliance', expect.any(Function))

    unmount()

    expect(unregisterCacheReset).toHaveBeenCalledWith('data-compliance')
  })

  // ── 20. Auto-refresh interval ─────────────────────────────────────────

  it('sets up auto-refresh interval for reachable clusters and clears on unmount', () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'auto-ref', reachable: true }]

    setupSingleClusterExec({})

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const { unmount } = renderHook(() => useDataCompliance())

    expect(setIntervalSpy).toHaveBeenCalled()

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  it('does NOT set up polling auto-refresh in demo mode', () => {
    mockDemoMode = true
    mockAllClusters = []

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    const { unmount } = renderHook(() => useDataCompliance())

    /** Data compliance hook refresh interval = 180 000 ms (3 minutes) */
    const DC_REFRESH_INTERVAL_MS = 180_000
    const pollingCalls = setIntervalSpy.mock.calls.filter(
      call => call[1] === DC_REFRESH_INTERVAL_MS,
    )
    expect(pollingCalls).toHaveLength(0)

    unmount()
  })

  // ── 21. Multi-cluster aggregation ─────────────────────────────────────

  it('aggregates compliance data across multiple clusters', async () => {
    mockDemoMode = false
    mockAllClusters = [
      { name: 'cluster-a', reachable: true },
      { name: 'cluster-b', reachable: true },
    ]

    mockExec.mockImplementation((args: string[], opts: { context: string }) => {
      const cmd = args.join(' ')

      if (cmd.includes('secrets')) {
        if (opts.context === 'cluster-a') {
          return Promise.resolve(kubectlOk('Opaque\nkubernetes.io/tls'))
        }
        return Promise.resolve(kubectlOk('Opaque\nOpaque\nkubernetes.io/service-account-token'))
      }
      if (cmd.includes('roles,clusterroles')) {
        if (opts.context === 'cluster-a') {
          return Promise.resolve(kubectlOk('111')) // 3 roles
        }
        return Promise.resolve(kubectlOk('11111')) // 5 roles
      }
      if (cmd.includes('clusterrolebindings')) {
        return Promise.resolve(kubectlOk(JSON.stringify({ items: [] })))
      }
      if (cmd.includes('rolebindings')) {
        return Promise.resolve(kubectlOk('11')) // 2 rolebindings
      }
      if (cmd.includes('namespaces')) {
        if (opts.context === 'cluster-a') {
          return Promise.resolve(kubectlOk('1111')) // 4 namespaces
        }
        return Promise.resolve(kubectlOk('111')) // 3 namespaces
      }

      return Promise.resolve(kubectlFail())
    })

    const { result, unmount } = renderHook(() => useDataCompliance())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // cluster-a: 2 secrets, cluster-b: 3 secrets → total 5
    expect(result.current.posture.totalSecrets).toBe(5)
    // cluster-a: 1 opaque, cluster-b: 2 opaque → total 3
    expect(result.current.posture.opaqueSecrets).toBe(3)
    // cluster-a: 1 tls, cluster-b: 0 → total 1
    expect(result.current.posture.tlsSecrets).toBe(1)
    // cluster-a: 0, cluster-b: 1 → total 1
    expect(result.current.posture.saTokenSecrets).toBe(1)
    // cluster-a: 3 roles, cluster-b: 5 roles → total 8
    expect(result.current.posture.rbacPolicies).toBe(8)
    // Both clusters: 0 CRB + 2 RB each = 4
    expect(result.current.posture.roleBindings).toBe(4)
    // cluster-a: 4 ns, cluster-b: 3 ns → total 7
    expect(result.current.posture.totalNamespaces).toBe(7)
    expect(result.current.posture.totalClusters).toBe(2)
    expect(result.current.posture.reachableClusters).toBe(2)

    unmount()
  })

  // ── 22. Gracefully handles individual kubectl failures ────────────────

  it('continues with other data when one kubectl call fails', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'partial-fail', reachable: true }]

    mockExec.mockImplementation((args: string[]) => {
      const cmd = args.join(' ')

      // Secrets fetch fails
      if (cmd.includes('secrets')) {
        return Promise.reject(new Error('timeout'))
      }
      // Roles succeed
      if (cmd.includes('roles,clusterroles')) {
        return Promise.resolve(kubectlOk('11111')) // 5 roles
      }
      if (cmd.includes('clusterrolebindings')) {
        return Promise.resolve(kubectlOk(JSON.stringify({ items: [] })))
      }
      if (cmd.includes('rolebindings')) {
        return Promise.resolve(kubectlOk('111')) // 3 bindings
      }
      if (cmd.includes('namespaces')) {
        return Promise.resolve(kubectlOk('1111')) // 4 namespaces
      }

      return Promise.resolve(kubectlFail())
    })

    const { result, unmount } = renderHook(() => useDataCompliance())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Secrets failed → 0, but other data should be populated
    expect(result.current.posture.totalSecrets).toBe(0)
    expect(result.current.posture.rbacPolicies).toBe(5)
    expect(result.current.posture.roleBindings).toBe(3)
    expect(result.current.posture.totalNamespaces).toBe(4)
    expect(result.current.isDemoData).toBe(false)

    unmount()
  })

  // ── 23. Handles corrupt sessionStorage gracefully ───────────────────────

  it('handles corrupt sessionStorage cache gracefully', () => {
    sessionStorage.setItem(CACHE_KEY, 'NOT_VALID_JSON')

    // Should not throw — loadFromCache returns null on parse error
    const { result, unmount } = renderHook(() => useDataCompliance())

    // Falls back to DEMO_POSTURE as initial state
    expect(result.current.posture.totalSecrets).toBe(164)

    unmount()
  })

  // ── 24. Does not fetch while cert-manager is still loading ────────────

  it('waits for cert-manager to finish loading before fetching', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'wait-cert', reachable: true }]
    mockCertLoading = true

    const {unmount } = renderHook(() => useDataCompliance())

    // cert still loading → the effect's condition `clusters.length > 0 && !certLoading`
    // is false, so mockExec should NOT have been called
    expect(mockExec).not.toHaveBeenCalled()

    unmount()
  })

  // ── 25. RBAC score floors at 0 ────────────────────────────────────────

  it('floors RBAC score at 0 when all bindings are cluster-admin', async () => {
    mockDemoMode = false
    mockAllClusters = [{ name: 'all-admin', reachable: true }]

    const allAdminBindings = {
      items: [
        { roleRef: { name: 'cluster-admin' } },
        { roleRef: { name: 'cluster-admin' } },
        { roleRef: { name: 'cluster-admin' } },
      ],
    }

    setupSingleClusterExec({
      clusterRoleBindingsJson: JSON.stringify(allAdminBindings),
      roleBindingCount: 0,
    })

    const { result, unmount } = renderHook(() => useDataCompliance())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // 3 cluster-admin out of 3 total → 100 - (3/3)*100 = 0
    expect(result.current.scores.rbacScore).toBe(0)

    unmount()
  })
})
