import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

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

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { useK8sRoles, useK8sRoleBindings, useK8sServiceAccounts } from '../rbac'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
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
})
