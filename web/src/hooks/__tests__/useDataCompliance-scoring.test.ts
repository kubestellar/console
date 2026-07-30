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
})
