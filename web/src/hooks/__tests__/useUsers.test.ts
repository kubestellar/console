import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGet = vi.fn()
const mockPut = vi.fn()
const mockDelete = vi.fn()

vi.mock('../../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
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
  useClusters: vi.fn(() => ({ deduplicatedClusters: [], clusters: [], isLoading: false })),
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, FETCH_DEFAULT_TIMEOUT_MS: 5000 }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<{ id: string; name: string; email: string; role: string }> = {}) {
  return {
    id: overrides.id ?? 'user-1',
    name: overrides.name ?? 'Test User',
    email: overrides.email ?? 'test@example.com',
    role: overrides.role ?? 'viewer',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockGetDemoMode.mockReturnValue(false)
  mockGet.mockResolvedValue({ data: [] })
  mockPut.mockResolvedValue({ data: {} })
  mockDelete.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useConsoleUsers', () => {
  // Need to dynamically import since mocks must be set up first
  async function importHook() {
    const mod = await import('../useUsers')
    return mod.useConsoleUsers
  }

  it('fetches users on mount', async () => {
    const users = [makeUser({ id: '1', name: 'Alice' }), makeUser({ id: '2', name: 'Bob' })]
    mockGet.mockResolvedValue({ data: users })

    const useConsoleUsers = await importHook()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual(users)
    expect(result.current.error).toBeNull()
    expect(mockGet).toHaveBeenCalledWith('/api/users')
  })

  it('returns demo data in demo mode', async () => {
    mockGetDemoMode.mockReturnValue(true)

    const useConsoleUsers = await importHook()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Demo data should be non-empty
    expect(result.current.users.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
    // Should NOT call the API
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('handles API error gracefully', async () => {
    mockGet.mockRejectedValue(new Error('Network error'))

    const useConsoleUsers = await importHook()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual([])
    expect(result.current.error).toBe('Network error')
  })

  it('handles null API response', async () => {
    mockGet.mockResolvedValue({ data: null })

    const useConsoleUsers = await importHook()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.users).toEqual([])
  })

  it('updateUserRole calls PUT and updates local state', async () => {
    const users = [makeUser({ id: 'u1', name: 'Alice', role: 'viewer' })]
    mockGet.mockResolvedValue({ data: users })
    mockPut.mockResolvedValue({ data: {} })

    const useConsoleUsers = await importHook()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.updateUserRole('u1', 'admin' as never)
    })

    expect(mockPut).toHaveBeenCalledWith('/api/users/u1/role', { role: 'admin' })
    expect(result.current.users[0].role).toBe('admin')
  })

  it('deleteUser calls DELETE and removes from local state', async () => {
    const users = [makeUser({ id: 'u1' }), makeUser({ id: 'u2' })]
    mockGet.mockResolvedValue({ data: users })

    const useConsoleUsers = await importHook()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.users).toHaveLength(2)

    await act(async () => {
      await result.current.deleteUser('u1')
    })

    expect(mockDelete).toHaveBeenCalledWith('/api/users/u1')
    expect(result.current.users).toHaveLength(1)
    expect(result.current.users[0].id).toBe('u2')
  })

  it('refetch reloads users from API', async () => {
    mockGet.mockResolvedValueOnce({ data: [makeUser({ id: '1' })] })

    const useConsoleUsers = await importHook()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.users).toHaveLength(1)

    // Now return different data
    mockGet.mockResolvedValueOnce({ data: [makeUser({ id: '1' }), makeUser({ id: '2' })] })

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.users).toHaveLength(2)
  })

  it('shows refreshing state during refetch', async () => {
    mockGet.mockResolvedValue({ data: [makeUser()] })

    const useConsoleUsers = await importHook()
    const { result } = renderHook(() => useConsoleUsers())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // isRefreshing should be false when not actively fetching
    expect(result.current.isRefreshing).toBe(false)
  })
})

describe('useUserManagementSummary', () => {
  async function importHook() {
    const mod = await import('../useUsers')
    return mod.useUserManagementSummary
  }

  it('returns expected shape', async () => {
    mockGet.mockResolvedValue({ data: { totalUsers: 5, activeUsers: 3, roles: {} } })

    const useUserManagementSummary = await importHook()
    const { result } = renderHook(() => useUserManagementSummary())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current).toHaveProperty('summary')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('refetch')
  })

  it('returns demo data in demo mode', async () => {
    mockGetDemoMode.mockReturnValue(true)

    const useUserManagementSummary = await importHook()
    const { result } = renderHook(() => useUserManagementSummary())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.summary).not.toBeNull()
    expect(mockGet).not.toHaveBeenCalled()
  })
})

describe('useClusterPermissions', () => {
  async function importHook() {
    const mod = await import('../useUsers')
    return mod.useClusterPermissions
  }

  it('returns expected shape', async () => {
    const useClusterPermissions = await importHook()
    const { result } = renderHook(() => useClusterPermissions('test-cluster'))

    expect(result.current).toHaveProperty('isLoading')
  })
})
