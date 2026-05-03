import { describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — only external dependencies, never the hook itself
// ---------------------------------------------------------------------------

const mockGet = vi.fn()
const mockPut = vi.fn()
const mockPost = vi.fn()
const mockDelete = vi.fn()

vi.mock('../../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
  isBackendUnavailable: () => false,
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'kc-auth-token' }
})

const mockGetDemoMode = vi.fn(() => false)
vi.mock('../useDemoMode', () => ({
  getDemoMode: () => mockGetDemoMode(),
  isDemoModeForced: false,
  isNetlifyDeployment: () => false,
  canToggleDemoMode: () => true,
  isDemoToken: () => false,
  hasRealToken: () => false,
  setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

const mockAgentFetch = vi.fn((...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])))
vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
  clusterCacheRef: { clusters: [] },
}))

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: () => true,
  reportAgentDataError: vi.fn(),
  reportAgentDataSuccess: vi.fn(),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: vi.fn() },
}))

vi.mock('../useMCP', () => ({
  useClusters: vi.fn(() => ({
    deduplicatedClusters: [],
    clusters: [],
    isLoading: false,
  })),
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, FETCH_DEFAULT_TIMEOUT_MS: 5000 }
})

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockGetDemoMode.mockReturnValue(false)
  mockGet.mockResolvedValue({ data: [] })
  mockPut.mockResolvedValue({ data: {} })
  mockPost.mockResolvedValue({ data: {} })
  mockDelete.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Import helpers — dynamic import so vi.mock takes effect first
// ---------------------------------------------------------------------------

async function getHooks() {
  return import('../useUsers')
}

// Stable empty array to avoid infinite re-renders with hooks that use
// arrays in useCallback dependency lists (new [] on each render = new ref)
const EMPTY_CLUSTERS: Array<{ name: string }> = []

// =========================================================================
// useConsoleUsers
// =========================================================================


// =========================================================================
// NEW TESTS — push toward 80% coverage
// =========================================================================

// =========================================================================
// useConsoleUsers — additional coverage
// =========================================================================
describe('useConsoleUsers — additional coverage', () => {
  it('demo mode users have expected structure', async () => {
    mockGetDemoMode.mockReturnValue(true)

    const { useConsoleUsers } = await getHooks()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Verify demo user data structure
    const adminUser = result.current.users.find(u => u.role === 'admin')
    expect(adminUser).toBeDefined()
    expect(adminUser!.github_login).toBe('admin-user')
    expect(adminUser!.email).toBe('admin@example.com')
    expect(adminUser!.onboarded).toBe(true)
    expect(adminUser!.created_at).toBeDefined()
    expect(adminUser!.last_login).toBeDefined()
  })

  it('shows isRefreshing during subsequent fetches but not isLoading', async () => {
    const users = [
      { id: '1', github_id: '1', github_login: 'a', role: 'viewer', onboarded: true, created_at: '2024-01-01' },
    ]
    mockGet.mockResolvedValue({ data: users })

    const { useConsoleUsers } = await getHooks()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.users).toHaveLength(1)

    // Mock a delayed second fetch
    mockGet.mockResolvedValue({ data: [...users, { id: '2', github_id: '2', github_login: 'b', role: 'admin', onboarded: true, created_at: '2024-02-01' }] })

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.users).toHaveLength(2)
    expect(result.current.isRefreshing).toBe(false)
  })

  it('updateUserRole throws on API failure', async () => {
    const users = [{ id: 'u1', github_id: '1', github_login: 'a', role: 'viewer' as const, onboarded: true, created_at: '2024-01-01' }]
    mockGet.mockResolvedValue({ data: users })
    mockPut.mockRejectedValue(new Error('forbidden'))

    const { useConsoleUsers } = await getHooks()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await expect(act(async () => {
      await result.current.updateUserRole('u1', 'admin')
    })).rejects.toThrow('forbidden')
  })

  it('deleteUser throws on API failure', async () => {
    const users = [{ id: 'u1', github_id: '1', github_login: 'a', role: 'viewer' as const, onboarded: true, created_at: '2024-01-01' }]
    mockGet.mockResolvedValue({ data: users })
    mockDelete.mockRejectedValue(new Error('not found'))

    const { useConsoleUsers } = await getHooks()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await expect(act(async () => {
      await result.current.deleteUser('u1')
    })).rejects.toThrow('not found')
  })
})

// =========================================================================
// useUserManagementSummary — additional coverage
// =========================================================================
describe('useUserManagementSummary — additional coverage', () => {
  it('demo summary has expected cluster permissions structure', async () => {
    mockGetDemoMode.mockReturnValue(true)

    const { useUserManagementSummary } = await getHooks()
    const { result } = renderHook(() => useUserManagementSummary())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.summary!.currentUserPermissions.length).toBeGreaterThan(0)
    const prodPerms = result.current.summary!.currentUserPermissions.find(p => p.cluster === 'prod-east')
    expect(prodPerms).toBeDefined()
    expect(prodPerms!.isClusterAdmin).toBe(true)
    expect(prodPerms!.canCreateServiceAccounts).toBe(true)
  })

  it('demo summary has k8s service accounts info', async () => {
    mockGetDemoMode.mockReturnValue(true)

    const { useUserManagementSummary } = await getHooks()
    const { result } = renderHook(() => useUserManagementSummary())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.summary!.k8sServiceAccounts.total).toBe(11)
    expect(result.current.summary!.k8sServiceAccounts.clusters).toContain('prod-east')
  })
})

// =========================================================================
// useOpenShiftUsers — additional coverage
// =========================================================================
describe('useOpenShiftUsers — additional coverage', () => {
  it('demo data includes expected user fields', async () => {
    mockGet.mockRejectedValue(new Error('unavailable'))

    const { useOpenShiftUsers } = await getHooks()
    const { result } = renderHook(() => useOpenShiftUsers('test-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users.length).toBe(4)
    const admin = result.current.users.find(u => u.name === 'admin')
    expect(admin).toBeDefined()
    expect(admin!.fullName).toBe('Cluster Admin')
    expect(admin!.identities).toContain('htpasswd:admin')
    expect(admin!.groups).toContain('system:cluster-admins')
    expect(admin!.cluster).toBe('test-cluster')
  })

  it('refetch clears and reloads data', async () => {
    const users = [{ name: 'user1', cluster: 'c1' }]
    mockGet.mockResolvedValue({ data: users })

    const { useOpenShiftUsers } = await getHooks()
    const { result } = renderHook(() => useOpenShiftUsers('c1'))

    await waitFor(() => expect(result.current.users).toHaveLength(1))

    const updatedUsers = [{ name: 'user1', cluster: 'c1' }, { name: 'user2', cluster: 'c1' }]
    mockGet.mockResolvedValue({ data: updatedUsers })

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.users).toHaveLength(2)
  })
})

// =========================================================================
// useK8sRoles — additional coverage
// =========================================================================
describe('useK8sRoles — additional coverage', () => {
  it('fetches roles with namespace and includeSystem params', async () => {
    mockGet.mockResolvedValue({ data: [] })

    const { useK8sRoles } = await getHooks()
    renderHook(() => useK8sRoles('prod', 'monitoring', true))

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringMatching(/cluster=prod.*namespace=monitoring.*includeSystem=true/),
        expect.objectContaining({ timeout: 60000 }),
      ),
    )
  })

  it('does nothing when cluster is empty string', async () => {
    const { useK8sRoles } = await getHooks()
    const { result } = renderHook(() => useK8sRoles(''))

    expect(result.current.isLoading).toBe(false)
    expect(result.current.roles).toEqual([])
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('silently fails on API error', async () => {
    mockGet.mockRejectedValue(new Error('timeout'))

    const { useK8sRoles } = await getHooks()
    const { result } = renderHook(() => useK8sRoles('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.roles).toEqual([])
  })

  it('handles null data from API', async () => {
    mockGet.mockResolvedValue({ data: null })

    const { useK8sRoles } = await getHooks()
    const { result } = renderHook(() => useK8sRoles('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.roles).toEqual([])
  })
})

// =========================================================================
// useK8sRoleBindings — additional coverage
// =========================================================================
describe('useK8sRoleBindings — additional coverage', () => {
  it('fetches bindings with namespace and includeSystem params', async () => {
    mockGet.mockResolvedValue({ data: [] })

    const { useK8sRoleBindings } = await getHooks()
    renderHook(() => useK8sRoleBindings('prod', 'kube-system', true))

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringMatching(/cluster=prod.*namespace=kube-system.*includeSystem=true/),
        expect.objectContaining({ timeout: 60000 }),
      ),
    )
  })

  it('does nothing when cluster is empty string', async () => {
    const { useK8sRoleBindings } = await getHooks()
    const { result } = renderHook(() => useK8sRoleBindings(''))

    expect(result.current.isLoading).toBe(false)
    expect(result.current.bindings).toEqual([])
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('createRoleBinding POSTs to kc-agent and refetches bindings', async () => {
    // #7993 Phase 1.5 PR A: createRoleBinding routes through kc-agent.
    mockGet.mockResolvedValue({ data: [] })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { useK8sRoleBindings } = await getHooks()
    const { result } = renderHook(() => useK8sRoleBindings('prod'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      const ok = await result.current.createRoleBinding({
        name: 'test-binding',
        namespace: 'default',
        cluster: 'prod',
        roleName: 'edit',
        roleKind: 'ClusterRole',
        subjects: [{ kind: 'User', name: 'alice' }],
      })
      expect(ok).toBe(true)
    })

    expect(fetchSpy).toHaveBeenCalled()
    const callUrl = fetchSpy.mock.calls[0]?.[0] as string
    expect(callUrl).toContain('/rolebindings')
    // Verify the body was POSTed as JSON with the original fields preserved.
    const callInit = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined
    expect(callInit?.method).toBe('POST')
    expect(JSON.parse(String(callInit?.body))).toMatchObject({
      name: 'test-binding',
      roleName: 'edit',
    })
  })

  it('silently fails on API error', async () => {
    mockGet.mockRejectedValue(new Error('forbidden'))

    const { useK8sRoleBindings } = await getHooks()
    const { result } = renderHook(() => useK8sRoleBindings('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.bindings).toEqual([])
  })
})

// =========================================================================
// useAllK8sServiceAccounts — additional coverage
// =========================================================================
describe('useAllK8sServiceAccounts — additional coverage', () => {
  it('fetches SAs from all clusters and aggregates them', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('cluster=c1')) {
        return Promise.resolve({ data: [{ name: 'default', namespace: 'default', cluster: 'c1' }] })
      }
      if (url.includes('cluster=c2')) {
        return Promise.resolve({ data: [{ name: 'prometheus', namespace: 'monitoring', cluster: 'c2' }] })
      }
      return Promise.resolve({ data: [] })
    })

    const { useAllK8sServiceAccounts } = await getHooks()
    const clusters = [{ name: 'c1' }, { name: 'c2' }]
    const { result } = renderHook(() => useAllK8sServiceAccounts(clusters))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.serviceAccounts).toHaveLength(2)
    expect(result.current.failedClusters).toEqual([])
  })

  it('returns empty when clusters array is empty', async () => {
    const { useAllK8sServiceAccounts } = await getHooks()
    const { result } = renderHook(() => useAllK8sServiceAccounts(EMPTY_CLUSTERS))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts).toEqual([])
  })

  it('marks failed clusters and adds demo data for them', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('cluster=good')) {
        return Promise.resolve({ data: [{ name: 'real-sa', cluster: 'good' }] })
      }
      if (url.includes('cluster=bad')) {
        return Promise.reject(new Error('unreachable'))
      }
      return Promise.resolve({ data: [] })
    })

    const { useAllK8sServiceAccounts } = await getHooks()
    const clusters = [{ name: 'good' }, { name: 'bad' }]
    const { result } = renderHook(() => useAllK8sServiceAccounts(clusters))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.serviceAccounts.length).toBeGreaterThan(1)
    expect(result.current.failedClusters).toContain('bad')
  })

  it('handles null data from API for a cluster', async () => {
    mockGet.mockResolvedValue({ data: null })

    const { useAllK8sServiceAccounts } = await getHooks()
    const clusters = [{ name: 'c1' }]
    const { result } = renderHook(() => useAllK8sServiceAccounts(clusters))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.serviceAccounts).toEqual([])
    expect(result.current.failedClusters).toEqual([])
  })
})

// =========================================================================
// useK8sServiceAccounts — additional coverage
// =========================================================================
describe('useK8sServiceAccounts — additional coverage', () => {
  it('demo data filters by namespace when specified', async () => {
    mockGet.mockRejectedValue(new Error('fail'))

    const { useK8sServiceAccounts } = await getHooks()
    const { result } = renderHook(() => useK8sServiceAccounts('prod', 'monitoring'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Demo data should only contain monitoring namespace SAs
    result.current.serviceAccounts.forEach(sa => {
      expect(sa.namespace).toBe('monitoring')
    })
  })

  it('sets unreachable error message for unreachable cluster error', async () => {
    mockGet.mockRejectedValue(new Error('cluster unreachable: connection refused'))

    const { useK8sServiceAccounts } = await getHooks()
    const { result } = renderHook(() => useK8sServiceAccounts('dead-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Falls back to demo data
    expect(result.current.serviceAccounts.length).toBeGreaterThan(0)
  })

  it('clears old data when fetching for a new cluster', async () => {
    const sas = [{ name: 'sa1', namespace: 'default', cluster: 'c1', roles: [] }]
    mockGet.mockResolvedValue({ data: sas })

    const { useK8sServiceAccounts } = await getHooks()
    const { result, rerender } = renderHook(
      ({ cluster }: { cluster?: string }) => useK8sServiceAccounts(cluster),
      { initialProps: { cluster: 'c1' } },
    )

    await waitFor(() => expect(result.current.serviceAccounts).toHaveLength(1))

    // Switch to undefined
    rerender({ cluster: undefined })
    await waitFor(() => expect(result.current.serviceAccounts).toEqual([]))
  })
})
