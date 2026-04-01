import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useRef } from 'react'

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
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'kc-auth-token' }
})

const mockGetDemoMode = vi.fn(() => false)
vi.mock('../useDemoMode', () => ({
  getDemoMode: () => mockGetDemoMode(),
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

  it('createServiceAccount calls POST and appends to local state', async () => {
    mockGet.mockResolvedValue({ data: [] })
    const newSA = { name: 'new-sa', namespace: 'default', cluster: 'prod' }
    mockPost.mockResolvedValue({ data: newSA })

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

    expect(mockPost).toHaveBeenCalledWith('/api/rbac/service-accounts', {
      name: 'new-sa',
      namespace: 'default',
      cluster: 'prod',
    })
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

  it('createRoleBinding calls POST and refetches', async () => {
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
    mockPost.mockResolvedValue({ data: {} })

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

    expect(mockPost).toHaveBeenCalledWith(
      '/api/rbac/bindings',
      expect.objectContaining({
        name: 'new-binding',
        cluster: 'prod',
      }),
    )

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
  it('fetches permissions for a specific cluster', async () => {
    const perms = {
      cluster: 'prod',
      isClusterAdmin: true,
      canCreateServiceAccounts: true,
      canManageRBAC: true,
      canViewSecrets: true,
    }
    mockGet.mockResolvedValue({ data: perms })

    const { useClusterPermissions } = await getHooks()
    const { result } = renderHook(() => useClusterPermissions('prod'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Single object is wrapped in array
    expect(result.current.permissions).toEqual([perms])
    expect(mockGet).toHaveBeenCalledWith('/api/rbac/permissions?cluster=prod')
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
    mockGet.mockResolvedValue({ data: permsArr })

    const { useClusterPermissions } = await getHooks()
    const { result } = renderHook(() => useClusterPermissions())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Array stays as array
    expect(result.current.permissions).toEqual(permsArr)
    expect(mockGet).toHaveBeenCalledWith('/api/rbac/permissions')
  })

  it('silently fails on API error', async () => {
    mockGet.mockRejectedValue(new Error('auth error'))

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
    mockGet.mockResolvedValue({ data: perms })

    const { useClusterPermissions } = await getHooks()
    const { result } = renderHook(() => useClusterPermissions('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const updatedPerms = { ...perms, isClusterAdmin: true }
    mockGet.mockResolvedValue({ data: updatedPerms })

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.permissions[0].isClusterAdmin).toBe(true)
  })
})
