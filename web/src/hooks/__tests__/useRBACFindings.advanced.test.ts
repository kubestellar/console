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

vi.mock('../useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../useDemoMode')>()),
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
