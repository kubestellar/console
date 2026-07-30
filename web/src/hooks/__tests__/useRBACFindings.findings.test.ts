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
})
