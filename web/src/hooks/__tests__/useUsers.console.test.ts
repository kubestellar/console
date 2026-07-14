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
vi.mock('../useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../useDemoMode')>()),
  getDemoMode: () => mockGetDemoMode(),
  isDemoModeForced: false,
  isNetlifyDeployment: () => false,
  canToggleDemoMode: () => true,
  isDemoToken: () => false,
  hasRealToken: () => false,
  setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}
))

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

