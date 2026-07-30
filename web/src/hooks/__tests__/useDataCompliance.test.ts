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

vi.mock('../useDemoMode', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    isDemoModeForced: false,
    useDemoMode: () => ({
      isDemoMode: mockDemoMode,
      toggleDemoMode: vi.fn(),
      setDemoMode: vi.fn(),
    }),
  }
})

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

vi.mock('../mcp/shared', () => ({
  deduplicateClustersByServer: (clusters: unknown[]) => clusters,
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
})
