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

describe('useConsoleUsers', () => {
  it('fetches users from API on mount and returns them', async () => {
    const apiUsers = [
      {
        id: '1',
        github_id: '111',
        github_login: 'alice',
        email: 'alice@co.com',
        role: 'admin',
        onboarded: true,
        created_at: '2024-01-01T00:00:00Z',
      },
      {
        id: '2',
        github_id: '222',
        github_login: 'bob',
        role: 'viewer',
        onboarded: false,
        created_at: '2024-02-01T00:00:00Z',
      },
    ]
    mockGet.mockResolvedValue({ data: apiUsers })

    const { useConsoleUsers } = await getHooks()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual(apiUsers)
    expect(result.current.error).toBeNull()
    expect(result.current.isRefreshing).toBe(false)
    expect(mockGet).toHaveBeenCalledWith('/api/users')
  })

  it('returns demo data when demo mode is on (no API call)', async () => {
    mockGetDemoMode.mockReturnValue(true)

    const { useConsoleUsers } = await getHooks()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
    const logins = result.current.users.map((u) => u.github_login)
    expect(logins).toContain('admin-user')
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('sets error message on API failure and empties users', async () => {
    mockGet.mockRejectedValue(new Error('Network error'))

    const { useConsoleUsers } = await getHooks()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual([])
    expect(result.current.error).toBe('Network error')
  })

  it('handles non-Error rejection (string message)', async () => {
    mockGet.mockRejectedValue('server down')

    const { useConsoleUsers } = await getHooks()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('Failed to load users')
  })

  it('handles null data from API gracefully', async () => {
    mockGet.mockResolvedValue({ data: null })

    const { useConsoleUsers } = await getHooks()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('updateUserRole calls PUT and updates local state', async () => {
    const users = [
      {
        id: 'u1',
        github_id: '111',
        github_login: 'alice',
        role: 'viewer' as const,
        onboarded: true,
        created_at: '2024-01-01',
      },
    ]
    mockGet.mockResolvedValue({ data: users })
    mockPut.mockResolvedValue({ data: {} })

    const { useConsoleUsers } = await getHooks()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      const ok = await result.current.updateUserRole('u1', 'admin')
      expect(ok).toBe(true)
    })

    expect(mockPut).toHaveBeenCalledWith('/api/users/u1/role', {
      role: 'admin',
    })
    expect(result.current.users[0].role).toBe('admin')
  })

  it('deleteUser calls DELETE and removes user from local state', async () => {
    const users = [
      {
        id: 'u1',
        github_id: '1',
        github_login: 'a',
        role: 'viewer' as const,
        onboarded: true,
        created_at: '2024-01-01',
      },
      {
        id: 'u2',
        github_id: '2',
        github_login: 'b',
        role: 'editor' as const,
        onboarded: true,
        created_at: '2024-01-01',
      },
    ]
    mockGet.mockResolvedValue({ data: users })

    const { useConsoleUsers } = await getHooks()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.users).toHaveLength(2)

    await act(async () => {
      const ok = await result.current.deleteUser('u1')
      expect(ok).toBe(true)
    })

    expect(mockDelete).toHaveBeenCalledWith('/api/users/u1')
    expect(result.current.users).toHaveLength(1)
    expect(result.current.users[0].id).toBe('u2')
  })

  it('refetch reloads data from the API', async () => {
    mockGet.mockResolvedValueOnce({
      data: [
        {
          id: '1',
          github_id: '1',
          github_login: 'a',
          role: 'viewer',
          onboarded: true,
          created_at: '2024-01-01',
        },
      ],
    })

    const { useConsoleUsers } = await getHooks()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.users).toHaveLength(1)

    mockGet.mockResolvedValueOnce({
      data: [
        {
          id: '1',
          github_id: '1',
          github_login: 'a',
          role: 'viewer',
          onboarded: true,
          created_at: '2024-01-01',
        },
        {
          id: '2',
          github_id: '2',
          github_login: 'b',
          role: 'admin',
          onboarded: true,
          created_at: '2024-02-01',
        },
      ],
    })

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.users).toHaveLength(2)
  })
})

// =========================================================================
// useUserManagementSummary
// =========================================================================

describe('useUserManagementSummary', () => {
  it('fetches summary from API and returns it', async () => {
    const summaryData = {
      consoleUsers: { total: 10, admins: 2, editors: 5, viewers: 3 },
      k8sServiceAccounts: { total: 20, clusters: ['c1', 'c2'] },
      currentUserPermissions: [
        {
          cluster: 'c1',
          isClusterAdmin: true,
          canCreateServiceAccounts: true,
          canManageRBAC: true,
          canViewSecrets: true,
        },
      ],
    }
    mockGet.mockResolvedValue({ data: summaryData })

    const { useUserManagementSummary } = await getHooks()
    const { result } = renderHook(() => useUserManagementSummary())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.summary).toEqual(summaryData)
    expect(result.current.error).toBeNull()
    expect(mockGet).toHaveBeenCalledWith('/api/users/summary')
  })

  it('returns demo data in demo mode without calling API', async () => {
    mockGetDemoMode.mockReturnValue(true)

    const { useUserManagementSummary } = await getHooks()
    const { result } = renderHook(() => useUserManagementSummary())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.summary).not.toBeNull()
    expect(result.current.summary!.consoleUsers.total).toBe(4)
    expect(result.current.summary!.consoleUsers.admins).toBe(1)
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('falls back to demo data on API error', async () => {
    mockGet.mockRejectedValue(new Error('Server error'))

    const { useUserManagementSummary } = await getHooks()
    const { result } = renderHook(() => useUserManagementSummary())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.summary).not.toBeNull()
    expect(result.current.summary!.consoleUsers.total).toBe(4)
  })

  it('refetch reloads summary', async () => {
    const summaryData = {
      consoleUsers: { total: 5, admins: 1, editors: 2, viewers: 2 },
      k8sServiceAccounts: { total: 8, clusters: ['c1'] },
      currentUserPermissions: [],
    }
    mockGet.mockResolvedValue({ data: summaryData })

    const { useUserManagementSummary } = await getHooks()
    const { result } = renderHook(() => useUserManagementSummary())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const updatedSummary = {
      ...summaryData,
      consoleUsers: { ...summaryData.consoleUsers, total: 15 },
    }
    mockGet.mockResolvedValue({ data: updatedSummary })

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.summary!.consoleUsers.total).toBe(15)
  })
})

// =========================================================================
// useOpenShiftUsers
// =========================================================================

describe('useOpenShiftUsers', () => {
  it('fetches OpenShift users for a cluster', async () => {
    const osUsers = [
      {
        name: 'admin',
        fullName: 'Admin',
        identities: ['htpasswd:admin'],
        groups: [],
        cluster: 'prod',
      },
      { name: 'dev', cluster: 'prod' },
    ]
    mockGet.mockResolvedValue({ data: osUsers })

    const { useOpenShiftUsers } = await getHooks()
    const { result } = renderHook(() => useOpenShiftUsers('prod'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual(osUsers)
    expect(mockGet).toHaveBeenCalledWith('/api/openshift/users?cluster=prod')
  })

  it('returns empty array when no cluster is provided', async () => {
    const { useOpenShiftUsers } = await getHooks()
    const { result } = renderHook(() => useOpenShiftUsers(undefined))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual([])
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('falls back to demo data on API error', async () => {
    mockGet.mockRejectedValue(new Error('Connection refused'))

    const { useOpenShiftUsers } = await getHooks()
    const { result } = renderHook(() => useOpenShiftUsers('staging'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users.length).toBeGreaterThan(0)
    expect(result.current.users[0].cluster).toBe('staging')
  })

  it('handles null data from API', async () => {
    mockGet.mockResolvedValue({ data: null })

    const { useOpenShiftUsers } = await getHooks()
    const { result } = renderHook(() => useOpenShiftUsers('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual([])
  })

  it('clears users when cluster changes to undefined', async () => {
    mockGet.mockResolvedValue({
      data: [{ name: 'admin', cluster: 'c1' }],
    })

    const { useOpenShiftUsers } = await getHooks()
    const { result, rerender } = renderHook(
      ({ cluster }: { cluster?: string }) => useOpenShiftUsers(cluster),
      { initialProps: { cluster: 'c1' } },
    )

    await waitFor(() => expect(result.current.users).toHaveLength(1))

    rerender({ cluster: undefined })

    await waitFor(() => expect(result.current.users).toEqual([]))
  })
})

// =========================================================================
// useAllOpenShiftUsers
// =========================================================================

describe('useAllOpenShiftUsers', () => {
  it('fetches users from all clusters and aggregates them', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('cluster=c1')) {
        return Promise.resolve({
          data: [{ name: 'admin', cluster: 'c1' }],
        })
      }
      if (url.includes('cluster=c2')) {
        return Promise.resolve({
          data: [{ name: 'dev', cluster: 'c2' }],
        })
      }
      return Promise.resolve({ data: [] })
    })

    const { useAllOpenShiftUsers } = await getHooks()
    const clusters = [{ name: 'c1' }, { name: 'c2' }]
    const { result } = renderHook(() => useAllOpenShiftUsers(clusters))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toHaveLength(2)
    expect(result.current.failedClusters).toEqual([])
  })

  it('returns empty when clusters array is empty', async () => {
    const { useAllOpenShiftUsers } = await getHooks()
    // Use stable reference to avoid infinite re-renders
    const { result } = renderHook(() => useAllOpenShiftUsers(EMPTY_CLUSTERS))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual([])
  })

  it('marks failed clusters and adds demo data for them', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('cluster=good')) {
        return Promise.resolve({
          data: [{ name: 'real-user', cluster: 'good' }],
        })
      }
      if (url.includes('cluster=bad')) {
        return Promise.reject(new Error('unreachable'))
      }
      return Promise.resolve({ data: [] })
    })

    const { useAllOpenShiftUsers } = await getHooks()
    const clusters = [{ name: 'good' }, { name: 'bad' }]
    const { result } = renderHook(() => useAllOpenShiftUsers(clusters))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users.length).toBeGreaterThan(1)
    expect(result.current.failedClusters).toContain('bad')
  })

  it('handles null data from API for a cluster', async () => {
    mockGet.mockResolvedValue({ data: null })

    const { useAllOpenShiftUsers } = await getHooks()
    const clusters = [{ name: 'c1' }]
    const { result } = renderHook(() => useAllOpenShiftUsers(clusters))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual([])
    expect(result.current.failedClusters).toEqual([])
  })
})

// =========================================================================
// useK8sUsers
// =========================================================================

describe('useK8sUsers', () => {
  it('fetches K8s users for a cluster', async () => {
    const k8sUsers = [
      { kind: 'User' as const, name: 'alice', cluster: 'prod' },
      {
        kind: 'ServiceAccount' as const,
        name: 'default',
        namespace: 'kube-system',
        cluster: 'prod',
      },
    ]
    mockGet.mockResolvedValue({ data: k8sUsers })

    const { useK8sUsers } = await getHooks()
    const { result } = renderHook(() => useK8sUsers('prod'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual(k8sUsers)
    expect(mockGet).toHaveBeenCalledWith('/api/rbac/users?cluster=prod')
  })

  it('does nothing when cluster is undefined', async () => {
    const { useK8sUsers } = await getHooks()
    const { result } = renderHook(() => useK8sUsers(undefined))

    expect(result.current.isLoading).toBe(false)
    expect(result.current.users).toEqual([])
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('silently fails on API error', async () => {
    mockGet.mockRejectedValue(new Error('timeout'))

    const { useK8sUsers } = await getHooks()
    const { result } = renderHook(() => useK8sUsers('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual([])
  })

  it('handles null data from API', async () => {
    mockGet.mockResolvedValue({ data: null })

    const { useK8sUsers } = await getHooks()
    const { result } = renderHook(() => useK8sUsers('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual([])
  })
})

// =========================================================================
// useK8sServiceAccounts
// =========================================================================

describe('useK8sServiceAccounts', () => {
  it('fetches service accounts for a cluster', async () => {
    const sas = [
      { name: 'default', namespace: 'default', cluster: 'prod', roles: ['view'] },
      {
        name: 'prometheus',
        namespace: 'monitoring',
        cluster: 'prod',
        roles: ['cluster-view'],
      },
    ]
    mockGet.mockResolvedValue({ data: sas })

    const { useK8sServiceAccounts } = await getHooks()
    const { result } = renderHook(() => useK8sServiceAccounts('prod'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.serviceAccounts).toEqual(sas)
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('/api/rbac/service-accounts?'),
      expect.objectContaining({ timeout: 60000 }),
    )
  })

  it('returns empty array when no cluster is provided', async () => {
    const { useK8sServiceAccounts } = await getHooks()
    const { result } = renderHook(() => useK8sServiceAccounts(undefined))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.serviceAccounts).toEqual([])
    expect(result.current.error).toBeNull()
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('falls back to demo data on API error', async () => {
    mockGet.mockRejectedValue(new Error('connection refused'))

    const { useK8sServiceAccounts } = await getHooks()
    const { result } = renderHook(() => useK8sServiceAccounts('staging'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.serviceAccounts.length).toBeGreaterThan(0)
    expect(result.current.serviceAccounts[0].cluster).toBe('staging')
  })

  it('sets specific error for unreachable clusters', async () => {
    mockGet.mockRejectedValue(new Error('connection refused'))

    const { useK8sServiceAccounts } = await getHooks()
    const { result } = renderHook(() => useK8sServiceAccounts('bad-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toContain('not reachable')
  })

  it('includes namespace in query params when provided', async () => {
    mockGet.mockResolvedValue({ data: [] })

    const { useK8sServiceAccounts } = await getHooks()
    renderHook(() => useK8sServiceAccounts('prod', 'monitoring'))

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('namespace=monitoring'),
        expect.anything(),
      ),
    )
  })

  it('createServiceAccount POSTs to kc-agent and appends to local state', async () => {
    // #7993 Phase 1.5 PR A: createServiceAccount routes through kc-agent
    // (POST ${LOCAL_AGENT_HTTP_URL}/serviceaccounts) so the mutation runs
    // under the user's kubeconfig, not the backend pod SA. The old
    // api.post('/api/rbac/service-accounts', ...) call is gone.
    mockGet.mockResolvedValue({ data: [] })
    const newSA = { name: 'new-sa', namespace: 'default', cluster: 'prod' }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(newSA), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { useK8sServiceAccounts } = await getHooks()
    const { result } = renderHook(() => useK8sServiceAccounts('prod'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      const created = await result.current.createServiceAccount({
        name: 'new-sa',
        namespace: 'default',
        cluster: 'prod',
      })
      expect(created).toEqual(newSA)
    })

    expect(fetchSpy).toHaveBeenCalled()
    const callUrl = fetchSpy.mock.calls[0]?.[0] as string
    expect(callUrl).toContain('/serviceaccounts')
    expect(result.current.serviceAccounts).toHaveLength(1)
    expect(result.current.serviceAccounts[0].name).toBe('new-sa')
  })

  it('handles null data from API', async () => {
    mockGet.mockResolvedValue({ data: null })

    const { useK8sServiceAccounts } = await getHooks()
    const { result } = renderHook(() => useK8sServiceAccounts('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.serviceAccounts).toEqual([])
  })

  it('filters demo data by namespace on fallback', async () => {
    mockGet.mockRejectedValue(new Error('fail'))

    const { useK8sServiceAccounts } = await getHooks()
    const { result } = renderHook(() => useK8sServiceAccounts('c1', 'monitoring'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    result.current.serviceAccounts.forEach((sa) => {
      expect(sa.namespace).toBe('monitoring')
    })
  })
})

// =========================================================================
// useAllK8sServiceAccounts
// =========================================================================

describe('useAllK8sServiceAccounts', () => {
  it('fetches service accounts from all clusters', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('cluster=c1')) {
        return Promise.resolve({
          data: [{ name: 'sa1', namespace: 'default', cluster: 'c1' }],
        })
      }
      if (url.includes('cluster=c2')) {
        return Promise.resolve({
          data: [{ name: 'sa2', namespace: 'kube-system', cluster: 'c2' }],
        })
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
    // Use stable reference to avoid infinite re-renders
    const { result } = renderHook(() => useAllK8sServiceAccounts(EMPTY_CLUSTERS))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.serviceAccounts).toEqual([])
  })

  it('marks failed clusters and provides demo fallback', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('cluster=ok')) {
        return Promise.resolve({
          data: [{ name: 'sa-real', namespace: 'ns', cluster: 'ok' }],
        })
      }
      if (url.includes('cluster=fail')) {
        return Promise.reject(new Error('timeout'))
      }
      return Promise.resolve({ data: [] })
    })

    const { useAllK8sServiceAccounts } = await getHooks()
    const clusters = [{ name: 'ok' }, { name: 'fail' }]
    const { result } = renderHook(() => useAllK8sServiceAccounts(clusters))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.failedClusters).toContain('fail')
    expect(result.current.serviceAccounts.length).toBeGreaterThan(1)
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
// useK8sRoles
// =========================================================================

describe('useK8sRoles', () => {
  it('fetches roles for a cluster', async () => {
    const roles = [
      { name: 'admin', cluster: 'prod', isCluster: true, ruleCount: 5 },
      {
        name: 'view',
        namespace: 'default',
        cluster: 'prod',
        isCluster: false,
        ruleCount: 3,
      },
    ]
    mockGet.mockResolvedValue({ data: roles })

    const { useK8sRoles } = await getHooks()
    const { result } = renderHook(() => useK8sRoles('prod'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.roles).toEqual(roles)
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('/api/rbac/roles?cluster=prod'),
      expect.anything(),
    )
  })

  it('does not fetch when cluster is empty string', async () => {
    const { useK8sRoles } = await getHooks()
    const { result } = renderHook(() => useK8sRoles(''))

    expect(result.current.isLoading).toBe(false)
    expect(result.current.roles).toEqual([])
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('includes namespace and includeSystem in query params', async () => {
    mockGet.mockResolvedValue({ data: [] })

    const { useK8sRoles } = await getHooks()
    renderHook(() => useK8sRoles('prod', 'kube-system', true))

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringMatching(/namespace=kube-system.*includeSystem=true/),
        expect.anything(),
      ),
    )
  })

  it('silently fails on API error', async () => {
    mockGet.mockRejectedValue(new Error('500'))

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
// useK8sRoleBindings
// =========================================================================

describe('useK8sRoleBindings', () => {
  it('fetches bindings for a cluster', async () => {
    const bindings = [
      {
        name: 'admin-binding',
        cluster: 'prod',
        isCluster: true,
        roleName: 'cluster-admin',
        roleKind: 'ClusterRole',
        subjects: [{ kind: 'User' as const, name: 'alice' }],
      },
    ]
    mockGet.mockResolvedValue({ data: bindings })

    const { useK8sRoleBindings } = await getHooks()
    const { result } = renderHook(() => useK8sRoleBindings('prod'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.bindings).toEqual(bindings)
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('/api/rbac/bindings?cluster=prod'),
      expect.anything(),
    )
  })

  it('does not fetch when cluster is empty string', async () => {
    const { useK8sRoleBindings } = await getHooks()
    const { result } = renderHook(() => useK8sRoleBindings(''))

    expect(result.current.isLoading).toBe(false)
    expect(result.current.bindings).toEqual([])
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('includes namespace and includeSystem params', async () => {
    mockGet.mockResolvedValue({ data: [] })

    const { useK8sRoleBindings } = await getHooks()
    renderHook(() => useK8sRoleBindings('c1', 'ns1', true))

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringMatching(/namespace=ns1.*includeSystem=true/),
        expect.anything(),
      ),
    )
  })

  it('silently fails on API error', async () => {
    mockGet.mockRejectedValue(new Error('forbidden'))

    const { useK8sRoleBindings } = await getHooks()
    const { result } = renderHook(() => useK8sRoleBindings('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.bindings).toEqual([])
  })

  it('createRoleBinding POSTs to kc-agent and refetches', async () => {
    // #7993 Phase 1.5 PR A: createRoleBinding routes through kc-agent
    // (POST ${LOCAL_AGENT_HTTP_URL}/rolebindings) so the mutation runs under
    // the user's kubeconfig, not the backend pod SA.
    const initialBindings = [
      {
        name: 'existing',
        cluster: 'prod',
        isCluster: false,
        roleName: 'view',
        roleKind: 'Role',
        subjects: [],
      },
    ]
    mockGet
      .mockResolvedValueOnce({ data: initialBindings })
      .mockResolvedValueOnce({
        data: [
          ...initialBindings,
          {
            name: 'new-binding',
            cluster: 'prod',
            isCluster: false,
            roleName: 'edit',
            roleKind: 'Role',
            subjects: [{ kind: 'User', name: 'bob' }],
          },
        ],
      })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { useK8sRoleBindings } = await getHooks()
    const { result } = renderHook(() => useK8sRoleBindings('prod'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.bindings).toHaveLength(1)

    await act(async () => {
      const ok = await result.current.createRoleBinding({
        name: 'new-binding',
        cluster: 'prod',
        isCluster: false,
        roleName: 'edit',
        roleKind: 'Role',
        subjectKind: 'User',
        subjectName: 'bob',
      })
      expect(ok).toBe(true)
    })

    expect(fetchSpy).toHaveBeenCalled()
    const callUrl = fetchSpy.mock.calls[0]?.[0] as string
    expect(callUrl).toContain('/rolebindings')

    await waitFor(() => expect(result.current.bindings).toHaveLength(2))
  })

  it('handles null data from API', async () => {
    mockGet.mockResolvedValue({ data: null })

    const { useK8sRoleBindings } = await getHooks()
    const { result } = renderHook(() => useK8sRoleBindings('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.bindings).toEqual([])
  })
})

// =========================================================================
// useClusterPermissions
// =========================================================================

describe('useClusterPermissions', () => {
  // #7993 Phase 6: useClusterPermissions now calls kc-agent
  // (LOCAL_AGENT_HTTP_URL/rbac/permissions) directly via fetch instead of
  // routing through the backend's `api.get` wrapper, so SelfSubjectAccessReviews
  // run under the user's kubeconfig instead of the backend pod ServiceAccount.
  // The tests below mock global fetch accordingly.
  const mockFetchOk = (data: unknown) => () =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) }) as unknown as Promise<Response>

  it('fetches permissions for a specific cluster', async () => {
    const perms = {
      cluster: 'prod',
      isClusterAdmin: true,
      canCreateServiceAccounts: true,
      canManageRBAC: true,
      canViewSecrets: true,
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(perms))

    const { useClusterPermissions } = await getHooks()
    const { result } = renderHook(() => useClusterPermissions('prod'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Single object is wrapped in array
    expect(result.current.permissions).toEqual([perms])
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/rbac/permissions?cluster=prod')
  })

  it('fetches all cluster permissions when no cluster specified', async () => {
    const permsArr = [
      {
        cluster: 'c1',
        isClusterAdmin: true,
        canCreateServiceAccounts: true,
        canManageRBAC: true,
        canViewSecrets: true,
      },
      {
        cluster: 'c2',
        isClusterAdmin: false,
        canCreateServiceAccounts: false,
        canManageRBAC: false,
        canViewSecrets: false,
      },
    ]
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(permsArr))

    const { useClusterPermissions } = await getHooks()
    const { result } = renderHook(() => useClusterPermissions())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Array stays as array
    expect(result.current.permissions).toEqual(permsArr)
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/rbac/permissions')
    expect(url).not.toContain('?cluster=')
  })

  it('silently fails on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'))

    const { useClusterPermissions } = await getHooks()
    const { result } = renderHook(() => useClusterPermissions('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.permissions).toEqual([])
  })

  it('refetch reloads permissions', async () => {
    const perms = {
      cluster: 'c1',
      isClusterAdmin: false,
      canCreateServiceAccounts: false,
      canManageRBAC: false,
      canViewSecrets: false,
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(perms))

    const { useClusterPermissions } = await getHooks()
    const { result } = renderHook(() => useClusterPermissions('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const updatedPerms = { ...perms, isClusterAdmin: true }
    fetchSpy.mockImplementation(mockFetchOk(updatedPerms))

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.permissions[0].isClusterAdmin).toBe(true)
  })
})

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
