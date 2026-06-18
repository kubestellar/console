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
