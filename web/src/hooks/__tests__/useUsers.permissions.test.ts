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
