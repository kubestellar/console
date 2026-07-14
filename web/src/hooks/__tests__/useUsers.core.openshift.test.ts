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
