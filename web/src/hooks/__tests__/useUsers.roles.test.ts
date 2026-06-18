import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
