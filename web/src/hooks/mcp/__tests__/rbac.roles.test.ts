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

import { useK8sRoles } from '../rbac'

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
    mockUseDemoMode.mockReturnValue(true)

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

  // --- New regression-preventing tests ---

  it('filters demo roles by cluster to only matching cluster', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useK8sRoles('eks-prod-us-east-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    for (const role of result.current.roles) {
      expect(role.cluster).toBe('eks-prod-us-east-1')
    }
    // eks-prod-us-east-1 has 6 roles: admin, edit, view, pod-reader, cluster-admin, cluster-view
    const EXPECTED_EKS_ROLE_COUNT = 6
    expect(result.current.roles.length).toBe(EXPECTED_EKS_ROLE_COUNT)
  })

  it('returns all demo roles across clusters when cluster is undefined', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useK8sRoles())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const clusters = new Set(result.current.roles.map(r => r.cluster))
    expect(clusters.has('eks-prod-us-east-1')).toBe(true)
    expect(clusters.has('gke-staging')).toBe(true)
    // Total: 6 (eks) + 3 (gke) = 9
    const EXPECTED_TOTAL_DEMO_ROLES = 9
    expect(result.current.roles.length).toBe(EXPECTED_TOTAL_DEMO_ROLES)
  })

  it('distinguishes cluster-scoped vs namespace-scoped roles in demo data', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useK8sRoles('eks-prod-us-east-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const clusterRoles = result.current.roles.filter(r => r.isCluster)
    const nsRoles = result.current.roles.filter(r => !r.isCluster)

    // ClusterRoles should NOT have a namespace
    for (const cr of clusterRoles) {
      expect(cr.namespace).toBeUndefined()
    }
    // Namespace-scoped roles MUST have a namespace
    for (const nr of nsRoles) {
      expect(nr.namespace).toBeDefined()
    }
    expect(clusterRoles.length).toBeGreaterThan(0)
    expect(nsRoles.length).toBeGreaterThan(0)
  })

  it('does not call API when no cluster is provided in non-demo mode', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    const { result } = renderHook(() => useK8sRoles(undefined))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.roles).toEqual([])
    expect(mockApiGet).not.toHaveBeenCalled()
  })

  it('passes cluster and namespace as URL search params', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sRoles('test-cluster', 'my-namespace'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).toContain('cluster=test-cluster')
    expect(urlArg).toContain('namespace=my-namespace')
  })

  it('appends includeSystem=true query param when flag is set', async () => {
    mockApiGet.mockResolvedValue({ data: [] })
    const INCLUDE_SYSTEM = true

    renderHook(() => useK8sRoles('test-cluster', undefined, INCLUDE_SYSTEM))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).toContain('includeSystem=true')
  })

  it('omits namespace param when namespace is not provided', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sRoles('test-cluster'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).toContain('cluster=test-cluster')
    expect(urlArg).not.toContain('namespace=')
  })

  it('omits includeSystem param when not requested (default false)', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sRoles('test-cluster', 'ns'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).not.toContain('includeSystem')
  })

  it('returns empty array when API returns null data', async () => {
    mockApiGet.mockResolvedValue({ data: null })

    const { result } = renderHook(() => useK8sRoles('test-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.roles).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('calls API with 60s timeout', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sRoles('c1'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const API_TIMEOUT_MS = 60000
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: API_TIMEOUT_MS }),
    )
  })

  it('refetch function triggers a new API call', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    const { result } = renderHook(() => useK8sRoles('test-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockApiGet.mock.calls.length

    await act(async () => { await result.current.refetch() })

    expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('registers mode transition refetch with cluster:namespace key', () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sRoles('prod-cluster', 'kube-system'))

    expect(mockRegisterRefetch).toHaveBeenCalledWith(
      'k8s-roles:prod-cluster:kube-system',
      expect.any(Function),
    )
  })

  it('uses "all" placeholder in refetch key when cluster/namespace are omitted', () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    renderHook(() => useK8sRoles())

    expect(mockRegisterRefetch).toHaveBeenCalledWith(
      'k8s-roles:all:all',
      expect.any(Function),
    )
  })

  it('clears error on successful API response', async () => {
    // First call fails
    mockApiGet.mockRejectedValueOnce(new Error('fail'))
    const { result, rerender } = renderHook(
      ({ cluster }: { cluster: string }) => useK8sRoles(cluster),
      { initialProps: { cluster: 'eks-prod-us-east-1' } },
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Second call succeeds
    mockApiGet.mockResolvedValue({ data: [{ name: 'r1', cluster: 'c2', isCluster: false, ruleCount: 1 }] })
    rerender({ cluster: 'c2' })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeNull()
  })

  it('every demo role has a positive ruleCount', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useK8sRoles())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    for (const role of result.current.roles) {
      expect(role.ruleCount).toBeGreaterThan(0)
    }
  })

  it('demo cluster filter returns empty for unknown cluster name', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useK8sRoles('nonexistent-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.roles).toEqual([])
  })
})
