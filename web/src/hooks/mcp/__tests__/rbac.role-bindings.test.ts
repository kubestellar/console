import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

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

vi.mock('../../useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode(), toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: vi.fn(() => false),
}))

vi.mock('../../../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
}))

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'token' }
})

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, MCP_HOOK_TIMEOUT_MS: 5_000 }
})

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { useK8sRoleBindings } from '../rbac'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('token', 'test-token')
  mockIsDemoMode.mockReturnValue(false)
  mockUseDemoMode.mockReturnValue(false)
  mockRegisterRefetch.mockReturnValue(vi.fn())
})

afterEach(() => {
  vi.useRealTimers()
})

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
    mockUseDemoMode.mockReturnValue(true)

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

  // --- New regression-preventing tests ---

  it('filters demo bindings by cluster only', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useK8sRoleBindings('gke-staging'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    for (const binding of result.current.bindings) {
      expect(binding.cluster).toBe('gke-staging')
    }
    // gke-staging has 1 binding in demo data
    expect(result.current.bindings.length).toBe(1)
  })

  it('namespace filter includes cluster-scoped bindings (isCluster=true)', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() =>
      useK8sRoleBindings('eks-prod-us-east-1', 'default'),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should include both namespace=default AND isCluster=true bindings
    for (const binding of result.current.bindings) {
      expect(binding.cluster).toBe('eks-prod-us-east-1')
      expect(binding.namespace === 'default' || binding.isCluster).toBe(true)
    }
    // 3 namespace-scoped default + 1 cluster-scoped = 4
    const EXPECTED_DEFAULT_NS_BINDINGS = 4
    expect(result.current.bindings.length).toBe(EXPECTED_DEFAULT_NS_BINDINGS)
  })

  it('demo bindings contain all three subject kinds: User, Group, ServiceAccount', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useK8sRoleBindings())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const allSubjectKinds = new Set<string>()
    for (const binding of result.current.bindings) {
      for (const subject of binding.subjects) {
        allSubjectKinds.add(subject.kind)
      }
    }
    expect(allSubjectKinds.has('User')).toBe(true)
    expect(allSubjectKinds.has('Group')).toBe(true)
    expect(allSubjectKinds.has('ServiceAccount')).toBe(true)
  })

  it('demo bindings reference both Role and ClusterRole roleKind', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useK8sRoleBindings())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const roleKinds = new Set(result.current.bindings.map(b => b.roleKind))
    expect(roleKinds.has('Role')).toBe(true)
    expect(roleKinds.has('ClusterRole')).toBe(true)
  })

  it('does not call API when no cluster is provided', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sRoleBindings(undefined))

    // Give it a tick for the effect to run
    await waitFor(() => {})
    expect(mockApiGet).not.toHaveBeenCalled()
  })

  it('passes cluster, namespace, and includeSystem in API URL params', async () => {
    mockApiGet.mockResolvedValue({ data: [] })
    const INCLUDE_SYSTEM = true

    renderHook(() => useK8sRoleBindings('c1', 'ns1', INCLUDE_SYSTEM))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).toContain('/api/rbac/bindings')
    expect(urlArg).toContain('cluster=c1')
    expect(urlArg).toContain('namespace=ns1')
    expect(urlArg).toContain('includeSystem=true')
  })

  it('omits namespace and includeSystem params when not provided', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sRoleBindings('c1'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).not.toContain('namespace=')
    expect(urlArg).not.toContain('includeSystem')
  })

  it('returns empty array when API returns null data', async () => {
    mockApiGet.mockResolvedValue({ data: null })

    const { result } = renderHook(() => useK8sRoleBindings('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.bindings).toEqual([])
  })

  it('refetch function triggers a new API call', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    const { result } = renderHook(() => useK8sRoleBindings('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockApiGet.mock.calls.length

    await act(async () => { await result.current.refetch() })

    expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('registers mode transition refetch with correct composite key', () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sRoleBindings('prod', 'kube-system'))

    expect(mockRegisterRefetch).toHaveBeenCalledWith(
      'k8s-role-bindings:prod:kube-system',
      expect.any(Function),
    )
  })

  it('uses "all" placeholders when cluster/namespace are omitted', () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    renderHook(() => useK8sRoleBindings())

    expect(mockRegisterRefetch).toHaveBeenCalledWith(
      'k8s-role-bindings:all:all',
      expect.any(Function),
    )
  })

  it('ServiceAccount subjects carry a namespace field in demo data', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useK8sRoleBindings('gke-staging'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const saSubjects = result.current.bindings
      .flatMap(b => b.subjects)
      .filter(s => s.kind === 'ServiceAccount')
    expect(saSubjects.length).toBeGreaterThan(0)
    for (const sa of saSubjects) {
      expect(sa.namespace).toBeDefined()
    }
  })

  it('calls API with 60s timeout', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sRoleBindings('c1'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const API_TIMEOUT_MS = 60000
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: API_TIMEOUT_MS }),
    )
  })

  it('error remains null after API failure (silent fallback)', async () => {
    mockApiGet.mockRejectedValue(new Error('500 Internal Server Error'))

    const { result } = renderHook(() => useK8sRoleBindings('eks-prod-us-east-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // The hook deliberately swallows errors and falls back to demo data
    expect(result.current.error).toBeNull()
  })
})
