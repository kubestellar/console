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
