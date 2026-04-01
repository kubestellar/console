import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockUseDemoMode,
  mockApiGet,
  mockRegisterRefetch,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockApiGet: vi.fn(),
  mockRegisterRefetch: vi.fn(() => vi.fn()),
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../../../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
}))

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'token' }
})

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, MCP_HOOK_TIMEOUT_MS: 5_000 }
})

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { useK8sRoles, useK8sRoleBindings, useK8sServiceAccounts } from '../rbac'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('token', 'test-token')
  mockIsDemoMode.mockReturnValue(false)
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockRegisterRefetch.mockReturnValue(vi.fn())
})

afterEach(() => {
  vi.useRealTimers()
})

// ===========================================================================
// useK8sRoles
// ===========================================================================

describe('useK8sRoles', () => {
  it('returns initial loading state with empty roles array', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useK8sRoles('my-cluster'))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.roles).toEqual([])
  })

  it('returns roles from API after fetch resolves', async () => {
    const fakeRoles = [
      { name: 'admin', cluster: 'c1', namespace: 'default', isCluster: false, ruleCount: 12 },
      { name: 'cluster-admin', cluster: 'c1', isCluster: true, ruleCount: 20 },
    ]
    mockApiGet.mockResolvedValue({ data: fakeRoles })

    const { result } = renderHook(() => useK8sRoles('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.roles).toEqual(fakeRoles)
    expect(result.current.error).toBeNull()
  })

  it('returns demo roles when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useK8sRoles('eks-prod-us-east-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.roles.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('returns empty roles when no cluster is provided (non-demo)', async () => {
    const { result } = renderHook(() => useK8sRoles())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.roles).toEqual([])
  })

  it('falls back to demo data on API failure', async () => {
    mockApiGet.mockRejectedValue(new Error('API error'))

    // Use a cluster name that exists in the demo data
    const { result } = renderHook(() => useK8sRoles('eks-prod-us-east-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Falls back to demo data on error, so roles should be populated
    expect(result.current.roles.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('provides refetch function', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useK8sRoles('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  // --- New regression-preventing tests ---

  it('filters demo roles by cluster to only matching cluster', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useK8sRoles('eks-prod-us-east-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    for (const role of result.current.roles) {
      expect(role.cluster).toBe('eks-prod-us-east-1')
    }
    // eks-prod-us-east-1 has 6 roles: admin, edit, view, pod-reader, cluster-admin, cluster-view
    const EXPECTED_EKS_ROLE_COUNT = 6
    expect(result.current.roles.length).toBe(EXPECTED_EKS_ROLE_COUNT)
  })

  it('returns all demo roles across clusters when cluster is undefined', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useK8sRoles())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const clusters = new Set(result.current.roles.map(r => r.cluster))
    expect(clusters.has('eks-prod-us-east-1')).toBe(true)
    expect(clusters.has('gke-staging')).toBe(true)
    // Total: 6 (eks) + 3 (gke) = 9
    const EXPECTED_TOTAL_DEMO_ROLES = 9
    expect(result.current.roles.length).toBe(EXPECTED_TOTAL_DEMO_ROLES)
  })

  it('distinguishes cluster-scoped vs namespace-scoped roles in demo data', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useK8sRoles('eks-prod-us-east-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const clusterRoles = result.current.roles.filter(r => r.isCluster)
    const nsRoles = result.current.roles.filter(r => !r.isCluster)

    // ClusterRoles should NOT have a namespace
    for (const cr of clusterRoles) {
      expect(cr.namespace).toBeUndefined()
    }
    // Namespace-scoped roles MUST have a namespace
    for (const nr of nsRoles) {
      expect(nr.namespace).toBeDefined()
    }
    expect(clusterRoles.length).toBeGreaterThan(0)
    expect(nsRoles.length).toBeGreaterThan(0)
  })

  it('does not call API when no cluster is provided in non-demo mode', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    const { result } = renderHook(() => useK8sRoles(undefined))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.roles).toEqual([])
    expect(mockApiGet).not.toHaveBeenCalled()
  })

  it('passes cluster and namespace as URL search params', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sRoles('test-cluster', 'my-namespace'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).toContain('cluster=test-cluster')
    expect(urlArg).toContain('namespace=my-namespace')
  })

  it('appends includeSystem=true query param when flag is set', async () => {
    mockApiGet.mockResolvedValue({ data: [] })
    const INCLUDE_SYSTEM = true

    renderHook(() => useK8sRoles('test-cluster', undefined, INCLUDE_SYSTEM))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).toContain('includeSystem=true')
  })

  it('omits namespace param when namespace is not provided', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sRoles('test-cluster'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).toContain('cluster=test-cluster')
    expect(urlArg).not.toContain('namespace=')
  })

  it('omits includeSystem param when not requested (default false)', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sRoles('test-cluster', 'ns'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).not.toContain('includeSystem')
  })

  it('returns empty array when API returns null data', async () => {
    mockApiGet.mockResolvedValue({ data: null })

    const { result } = renderHook(() => useK8sRoles('test-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.roles).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('calls API with 60s timeout', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sRoles('c1'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const API_TIMEOUT_MS = 60000
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: API_TIMEOUT_MS }),
    )
  })

  it('refetch function triggers a new API call', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    const { result } = renderHook(() => useK8sRoles('test-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockApiGet.mock.calls.length

    await act(async () => { await result.current.refetch() })

    expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('registers mode transition refetch with cluster:namespace key', () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sRoles('prod-cluster', 'kube-system'))

    expect(mockRegisterRefetch).toHaveBeenCalledWith(
      'k8s-roles:prod-cluster:kube-system',
      expect.any(Function),
    )
  })

  it('uses "all" placeholder in refetch key when cluster/namespace are omitted', () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    renderHook(() => useK8sRoles())

    expect(mockRegisterRefetch).toHaveBeenCalledWith(
      'k8s-roles:all:all',
      expect.any(Function),
    )
  })

  it('clears error on successful API response', async () => {
    // First call fails
    mockApiGet.mockRejectedValueOnce(new Error('fail'))
    const { result, rerender } = renderHook(
      ({ cluster }: { cluster: string }) => useK8sRoles(cluster),
      { initialProps: { cluster: 'eks-prod-us-east-1' } },
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Second call succeeds
    mockApiGet.mockResolvedValue({ data: [{ name: 'r1', cluster: 'c2', isCluster: false, ruleCount: 1 }] })
    rerender({ cluster: 'c2' })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeNull()
  })

  it('every demo role has a positive ruleCount', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useK8sRoles())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    for (const role of result.current.roles) {
      expect(role.ruleCount).toBeGreaterThan(0)
    }
  })

  it('demo cluster filter returns empty for unknown cluster name', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useK8sRoles('nonexistent-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.roles).toEqual([])
  })
})

// ===========================================================================
// useK8sRoleBindings
// ===========================================================================

describe('useK8sRoleBindings', () => {
  it('returns initial loading state with empty bindings array', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useK8sRoleBindings('my-cluster'))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.bindings).toEqual([])
  })

  it('returns bindings from API after fetch resolves', async () => {
    const fakeBindings = [
      { name: 'admin-binding', cluster: 'c1', namespace: 'default', isCluster: false, roleName: 'admin', roleKind: 'Role', subjects: [{ kind: 'User' as const, name: 'admin-user' }] },
    ]
    mockApiGet.mockResolvedValue({ data: fakeBindings })

    const { result } = renderHook(() => useK8sRoleBindings('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.bindings).toEqual(fakeBindings)
    expect(result.current.error).toBeNull()
  })

  it('returns demo bindings when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useK8sRoleBindings('eks-prod-us-east-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.bindings.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('returns empty bindings when no cluster is provided (non-demo)', async () => {
    const { result } = renderHook(() => useK8sRoleBindings())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.bindings).toEqual([])
  })

  it('falls back to demo data on API failure', async () => {
    mockApiGet.mockRejectedValue(new Error('API error'))

    // Use a cluster name that exists in the demo data
    const { result } = renderHook(() => useK8sRoleBindings('eks-prod-us-east-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.bindings.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('provides refetch function', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useK8sRoleBindings('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  // --- New regression-preventing tests ---

  it('filters demo bindings by cluster only', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useK8sRoleBindings('gke-staging'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    for (const binding of result.current.bindings) {
      expect(binding.cluster).toBe('gke-staging')
    }
    // gke-staging has 1 binding in demo data
    expect(result.current.bindings.length).toBe(1)
  })

  it('namespace filter includes cluster-scoped bindings (isCluster=true)', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() =>
      useK8sRoleBindings('eks-prod-us-east-1', 'default'),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should include both namespace=default AND isCluster=true bindings
    for (const binding of result.current.bindings) {
      expect(binding.cluster).toBe('eks-prod-us-east-1')
      expect(binding.namespace === 'default' || binding.isCluster).toBe(true)
    }
    // 3 namespace-scoped default + 1 cluster-scoped = 4
    const EXPECTED_DEFAULT_NS_BINDINGS = 4
    expect(result.current.bindings.length).toBe(EXPECTED_DEFAULT_NS_BINDINGS)
  })

  it('demo bindings contain all three subject kinds: User, Group, ServiceAccount', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useK8sRoleBindings())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const allSubjectKinds = new Set<string>()
    for (const binding of result.current.bindings) {
      for (const subject of binding.subjects) {
        allSubjectKinds.add(subject.kind)
      }
    }
    expect(allSubjectKinds.has('User')).toBe(true)
    expect(allSubjectKinds.has('Group')).toBe(true)
    expect(allSubjectKinds.has('ServiceAccount')).toBe(true)
  })

  it('demo bindings reference both Role and ClusterRole roleKind', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useK8sRoleBindings())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const roleKinds = new Set(result.current.bindings.map(b => b.roleKind))
    expect(roleKinds.has('Role')).toBe(true)
    expect(roleKinds.has('ClusterRole')).toBe(true)
  })

  it('does not call API when no cluster is provided', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sRoleBindings(undefined))

    // Give it a tick for the effect to run
    await waitFor(() => {})
    expect(mockApiGet).not.toHaveBeenCalled()
  })

  it('passes cluster, namespace, and includeSystem in API URL params', async () => {
    mockApiGet.mockResolvedValue({ data: [] })
    const INCLUDE_SYSTEM = true

    renderHook(() => useK8sRoleBindings('c1', 'ns1', INCLUDE_SYSTEM))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).toContain('/api/rbac/bindings')
    expect(urlArg).toContain('cluster=c1')
    expect(urlArg).toContain('namespace=ns1')
    expect(urlArg).toContain('includeSystem=true')
  })

  it('omits namespace and includeSystem params when not provided', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sRoleBindings('c1'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).not.toContain('namespace=')
    expect(urlArg).not.toContain('includeSystem')
  })

  it('returns empty array when API returns null data', async () => {
    mockApiGet.mockResolvedValue({ data: null })

    const { result } = renderHook(() => useK8sRoleBindings('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.bindings).toEqual([])
  })

  it('refetch function triggers a new API call', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    const { result } = renderHook(() => useK8sRoleBindings('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockApiGet.mock.calls.length

    await act(async () => { await result.current.refetch() })

    expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('registers mode transition refetch with correct composite key', () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sRoleBindings('prod', 'kube-system'))

    expect(mockRegisterRefetch).toHaveBeenCalledWith(
      'k8s-role-bindings:prod:kube-system',
      expect.any(Function),
    )
  })

  it('uses "all" placeholders when cluster/namespace are omitted', () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    renderHook(() => useK8sRoleBindings())

    expect(mockRegisterRefetch).toHaveBeenCalledWith(
      'k8s-role-bindings:all:all',
      expect.any(Function),
    )
  })

  it('ServiceAccount subjects carry a namespace field in demo data', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useK8sRoleBindings('gke-staging'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const saSubjects = result.current.bindings
      .flatMap(b => b.subjects)
      .filter(s => s.kind === 'ServiceAccount')
    expect(saSubjects.length).toBeGreaterThan(0)
    for (const sa of saSubjects) {
      expect(sa.namespace).toBeDefined()
    }
  })

  it('calls API with 60s timeout', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sRoleBindings('c1'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const API_TIMEOUT_MS = 60000
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: API_TIMEOUT_MS }),
    )
  })

  it('error remains null after API failure (silent fallback)', async () => {
    mockApiGet.mockRejectedValue(new Error('500 Internal Server Error'))

    const { result } = renderHook(() => useK8sRoleBindings('eks-prod-us-east-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // The hook deliberately swallows errors and falls back to demo data
    expect(result.current.error).toBeNull()
  })
})

// ===========================================================================
// useK8sServiceAccounts
// ===========================================================================

describe('useK8sServiceAccounts', () => {
  it('returns initial loading state with empty service accounts array', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useK8sServiceAccounts('my-cluster'))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.serviceAccounts).toEqual([])
  })

  it('returns service accounts from API after fetch resolves', async () => {
    const fakeSAs = [
      { name: 'default', namespace: 'default', cluster: 'c1', secrets: ['default-token'] },
      { name: 'deployer', namespace: 'default', cluster: 'c1', secrets: ['deployer-token'], roles: ['admin'] },
    ]
    mockApiGet.mockResolvedValue({ data: fakeSAs })

    const { result } = renderHook(() => useK8sServiceAccounts('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts).toEqual(fakeSAs)
    expect(result.current.error).toBeNull()
  })

  it('returns demo service accounts when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useK8sServiceAccounts('eks-prod-us-east-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('falls back to demo data on API failure', async () => {
    mockApiGet.mockRejectedValue(new Error('API error'))

    // Use a cluster name that exists in the demo data
    const { result } = renderHook(() => useK8sServiceAccounts('eks-prod-us-east-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('provides refetch function', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useK8sServiceAccounts('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('filters by namespace when provided in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useK8sServiceAccounts('eks-prod-us-east-1', 'monitoring'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Demo SA data filters by namespace
    expect(result.current.serviceAccounts.every(sa => sa.namespace === 'monitoring')).toBe(true)
  })

  // --- New regression-preventing tests ---

  it('filters demo SAs by cluster only when no namespace given', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useK8sServiceAccounts('gke-staging'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    for (const sa of result.current.serviceAccounts) {
      expect(sa.cluster).toBe('gke-staging')
    }
    // gke-staging has: default (default ns) and ci-bot (ci-cd ns)
    const EXPECTED_GKE_SA_COUNT = 2
    expect(result.current.serviceAccounts.length).toBe(EXPECTED_GKE_SA_COUNT)
  })

  it('filters demo SAs by both cluster and namespace simultaneously', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() =>
      useK8sServiceAccounts('eks-prod-us-east-1', 'default'),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    for (const sa of result.current.serviceAccounts) {
      expect(sa.cluster).toBe('eks-prod-us-east-1')
      expect(sa.namespace).toBe('default')
    }
    // eks-prod-us-east-1 + default: "default" and "deployer"
    const EXPECTED_EKS_DEFAULT_SA_COUNT = 2
    expect(result.current.serviceAccounts.length).toBe(EXPECTED_EKS_DEFAULT_SA_COUNT)
  })

  it('demo SAs include secrets arrays', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useK8sServiceAccounts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    for (const sa of result.current.serviceAccounts) {
      expect(sa.secrets).toBeDefined()
      expect((sa.secrets || []).length).toBeGreaterThan(0)
    }
  })

  it('some demo SAs have roles while others do not', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useK8sServiceAccounts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const withRoles = result.current.serviceAccounts.filter(sa => sa.roles && sa.roles.length > 0)
    const withoutRoles = result.current.serviceAccounts.filter(sa => !sa.roles || sa.roles.length === 0)
    expect(withRoles.length).toBeGreaterThan(0)
    expect(withoutRoles.length).toBeGreaterThan(0)
  })

  it('calls API at /api/rbac/service-accounts with cluster param', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sServiceAccounts('c1'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).toContain('/api/rbac/service-accounts')
    expect(urlArg).toContain('cluster=c1')
  })

  it('passes namespace param when provided', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sServiceAccounts('c1', 'web'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).toContain('namespace=web')
  })

  it('omits namespace param when not provided', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sServiceAccounts('c1'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).not.toContain('namespace=')
  })

  it('still calls API when no cluster is provided (unlike roles/bindings)', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    const { result } = renderHook(() => useK8sServiceAccounts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // useK8sServiceAccounts does NOT have a cluster guard — it always calls API
    expect(mockApiGet).toHaveBeenCalled()
  })

  it('returns empty array when API returns null data', async () => {
    mockApiGet.mockResolvedValue({ data: null })

    const { result } = renderHook(() => useK8sServiceAccounts('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts).toEqual([])
  })

  it('refetch function triggers a new API call', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    const { result } = renderHook(() => useK8sServiceAccounts('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockApiGet.mock.calls.length

    await act(async () => { await result.current.refetch() })

    expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('registers mode transition refetch with correct composite key', () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sServiceAccounts('my-cluster', 'web'))

    expect(mockRegisterRefetch).toHaveBeenCalledWith(
      'k8s-service-accounts:my-cluster:web',
      expect.any(Function),
    )
  })

  it('uses "all" placeholder in refetch key when params are omitted', () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    renderHook(() => useK8sServiceAccounts())

    expect(mockRegisterRefetch).toHaveBeenCalledWith(
      'k8s-service-accounts:all:all',
      expect.any(Function),
    )
  })

  it('error remains null after API failure (silent fallback)', async () => {
    mockApiGet.mockRejectedValue(new Error('Connection refused'))

    const { result } = renderHook(() => useK8sServiceAccounts('eks-prod-us-east-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeNull()
  })

  it('calls API with 60s timeout', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sServiceAccounts('c1'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const API_TIMEOUT_MS = 60000
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: API_TIMEOUT_MS }),
    )
  })

  it('demo cluster filter returns empty for unknown cluster name', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useK8sServiceAccounts('nonexistent-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts).toEqual([])
  })
})
