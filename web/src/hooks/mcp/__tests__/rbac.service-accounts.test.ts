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

import { useK8sServiceAccounts } from '../rbac'

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
    mockUseDemoMode.mockReturnValue(true)

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
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useK8sServiceAccounts('eks-prod-us-east-1', 'monitoring'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Demo SA data filters by namespace
    expect(result.current.serviceAccounts.every(sa => sa.namespace === 'monitoring')).toBe(true)
  })

  // --- New regression-preventing tests ---

  it('filters demo SAs by cluster only when no namespace given', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useK8sServiceAccounts('gke-staging'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    for (const sa of result.current.serviceAccounts) {
      expect(sa.cluster).toBe('gke-staging')
    }
    // gke-staging has: default (default ns) and ci-bot (ci-cd ns)
    const EXPECTED_GKE_SA_COUNT = 2
    expect(result.current.serviceAccounts.length).toBe(EXPECTED_GKE_SA_COUNT)
  })

  it('filters demo SAs by both cluster and namespace simultaneously', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() =>
      useK8sServiceAccounts('eks-prod-us-east-1', 'default'),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    for (const sa of result.current.serviceAccounts) {
      expect(sa.cluster).toBe('eks-prod-us-east-1')
      expect(sa.namespace).toBe('default')
    }
    // eks-prod-us-east-1 + default: "default" and "deployer"
    const EXPECTED_EKS_DEFAULT_SA_COUNT = 2
    expect(result.current.serviceAccounts.length).toBe(EXPECTED_EKS_DEFAULT_SA_COUNT)
  })

  it('demo SAs include secrets arrays', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useK8sServiceAccounts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    for (const sa of result.current.serviceAccounts) {
      expect(sa.secrets).toBeDefined()
      expect((sa.secrets || []).length).toBeGreaterThan(0)
    }
  })

  it('some demo SAs have roles while others do not', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useK8sServiceAccounts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const withRoles = result.current.serviceAccounts.filter(sa => sa.roles && sa.roles.length > 0)
    const withoutRoles = result.current.serviceAccounts.filter(sa => !sa.roles || sa.roles.length === 0)
    expect(withRoles.length).toBeGreaterThan(0)
    expect(withoutRoles.length).toBeGreaterThan(0)
  })

  it('calls API at /api/rbac/service-accounts with cluster param', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sServiceAccounts('c1'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).toContain('/api/rbac/service-accounts')
    expect(urlArg).toContain('cluster=c1')
  })

  it('passes namespace param when provided', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sServiceAccounts('c1', 'web'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).toContain('namespace=web')
  })

  it('omits namespace param when not provided', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sServiceAccounts('c1'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).not.toContain('namespace=')
  })

  it('still calls API when no cluster is provided (unlike roles/bindings)', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    const { result } = renderHook(() => useK8sServiceAccounts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // useK8sServiceAccounts does NOT have a cluster guard — it always calls API
    expect(mockApiGet).toHaveBeenCalled()
  })

  it('returns empty array when API returns null data', async () => {
    mockApiGet.mockResolvedValue({ data: null })

    const { result } = renderHook(() => useK8sServiceAccounts('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts).toEqual([])
  })

  it('refetch function triggers a new API call', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    const { result } = renderHook(() => useK8sServiceAccounts('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockApiGet.mock.calls.length

    await act(async () => { await result.current.refetch() })

    expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('registers mode transition refetch with correct composite key', () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sServiceAccounts('my-cluster', 'web'))

    expect(mockRegisterRefetch).toHaveBeenCalledWith(
      'k8s-service-accounts:my-cluster:web',
      expect.any(Function),
    )
  })

  it('uses "all" placeholder in refetch key when params are omitted', () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    renderHook(() => useK8sServiceAccounts())

    expect(mockRegisterRefetch).toHaveBeenCalledWith(
      'k8s-service-accounts:all:all',
      expect.any(Function),
    )
  })

  it('error remains null after API failure (silent fallback)', async () => {
    mockApiGet.mockRejectedValue(new Error('Connection refused'))

    const { result } = renderHook(() => useK8sServiceAccounts('eks-prod-us-east-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeNull()
  })

  it('calls API with 60s timeout', async () => {
    mockApiGet.mockResolvedValue({ data: [] })

    renderHook(() => useK8sServiceAccounts('c1'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const API_TIMEOUT_MS = 60000
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: API_TIMEOUT_MS }),
    )
  })

  it('demo cluster filter returns empty for unknown cluster name', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useK8sServiceAccounts('nonexistent-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts).toEqual([])
  })
})
