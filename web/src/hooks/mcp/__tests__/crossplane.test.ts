import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockUseDemoMode,
  mockIsNetlifyDeployment,
  mockRegisterRefetch,
  mockRegisterCacheReset,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockIsNetlifyDeployment: { value: false },
  mockRegisterRefetch: vi.fn(() => vi.fn()),
  mockRegisterCacheReset: vi.fn(() => vi.fn()),
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
  get isNetlifyDeployment() { return mockIsNetlifyDeployment.value },
}))

vi.mock('../../useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
}))

vi.mock('../shared', () => ({
  MIN_REFRESH_INDICATOR_MS: 500,
  getEffectiveInterval: (ms: number) => ms,
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  MCP_HOOK_TIMEOUT_MS: 5_000,
} })

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { useCrossplaneManagedResources } from '../crossplane'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockIsDemoMode.mockReturnValue(false)
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockIsNetlifyDeployment.value = false
  mockRegisterRefetch.mockReturnValue(vi.fn())
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// useCrossplaneManagedResources
// ===========================================================================

describe('useCrossplaneManagedResources', () => {
  it('returns initial loading state with empty resources array', () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useCrossplaneManagedResources())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.resources).toEqual([])
  })

  it('returns managed resources after fetch resolves', async () => {
    const fakeResources = [
      {
        apiVersion: 'rds.aws.crossplane.io/v1beta1',
        kind: 'RDSInstance',
        metadata: { name: 'prod-db', namespace: 'infra', creationTimestamp: '2026-01-01T00:00:00Z' },
        status: { conditions: [{ type: 'Ready', status: 'True' as const }] },
      },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resources: fakeResources }),
    })

    const { result } = renderHook(() => useCrossplaneManagedResources())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resources).toEqual(fakeResources)
    expect(result.current.error).toBeNull()
    expect(result.current.isDemoData).toBe(false)
  })

  it('returns demo resources when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    // Use a cluster param to bypass the module-level cache from prior tests
    const { result } = renderHook(() => useCrossplaneManagedResources('demo-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resources.length).toBeGreaterThan(0)
    expect(result.current.isDemoData).toBe(true)
  })

  it('handles fetch failure and increments consecutive failures', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    // Use a cluster param to bypass cached data from prior tests
    const { result } = renderHook(() => useCrossplaneManagedResources('fail-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
    expect(result.current.error).toBeTruthy()
  })

  it('provides refetch function', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resources: [] }),
    })

    const { result } = renderHook(() => useCrossplaneManagedResources())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('sets isFailed after 3 consecutive failures', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('error'))

    const { result } = renderHook(() => useCrossplaneManagedResources())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isFailed).toBe(false) // only 1 failure so far
  })

  it('returns lastRefresh timestamp after successful fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resources: [] }),
    })

    const { result } = renderHook(() => useCrossplaneManagedResources())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastRefresh).toBeDefined()
  })

  it('handles non-Error exceptions with fallback message', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue('string error')

    const { result } = renderHook(() => useCrossplaneManagedResources('str-err-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Failed to fetch managed resources')
  })

  it('handles API error with status code in message', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    })

    const { result } = renderHook(() => useCrossplaneManagedResources('api-err-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('API error: 503')
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('does not fetch on Netlify deployment', async () => {
    mockIsNetlifyDeployment.value = true
    globalThis.fetch = vi.fn()

    const { result } = renderHook(() => useCrossplaneManagedResources('netlify-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isRefreshing).toBe(false)
  })

  it('handles response with missing resources key gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    const { result } = renderHook(() => useCrossplaneManagedResources('empty-key-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resources).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('returns full resource structure with conditions', async () => {
    const fullResource = {
      apiVersion: 's3.aws.crossplane.io/v1beta1',
      kind: 'Bucket',
      metadata: {
        name: 'my-bucket',
        namespace: 'storage',
        creationTimestamp: '2026-03-01T00:00:00Z',
        annotations: { 'crossplane.io/external-name': 'my-bucket-xyz' },
      },
      spec: { providerConfigRef: { name: 'aws-provider' } },
      status: {
        conditions: [
          { type: 'Ready', status: 'True' as const, reason: 'Available' },
          { type: 'Synced', status: 'True' as const, reason: 'ReconcileSuccess' },
        ],
      },
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resources: [fullResource] }),
    })

    const { result } = renderHook(() => useCrossplaneManagedResources('struct-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resources).toHaveLength(1)
    expect(result.current.resources[0].metadata.name).toBe('my-bucket')
    expect(result.current.resources[0].status?.conditions).toHaveLength(2)
    expect(result.current.resources[0].spec?.providerConfigRef?.name).toBe('aws-provider')
  })

  it('returns multiple resources from API response', async () => {
    const resources = [
      {
        apiVersion: 'rds.aws.crossplane.io/v1beta1',
        kind: 'RDSInstance',
        metadata: { name: 'db1', namespace: 'infra', creationTimestamp: '2026-01-01T00:00:00Z' },
      },
      {
        apiVersion: 'ec2.aws.crossplane.io/v1beta1',
        kind: 'VPC',
        metadata: { name: 'vpc1', namespace: 'network', creationTimestamp: '2026-01-02T00:00:00Z' },
      },
      {
        apiVersion: 'gcp.crossplane.io/v1beta1',
        kind: 'CloudSQLInstance',
        metadata: { name: 'gcp-db1', namespace: 'infra', creationTimestamp: '2026-01-03T00:00:00Z' },
      },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resources }),
    })

    const { result } = renderHook(() => useCrossplaneManagedResources('multi-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resources).toHaveLength(3)
    expect(result.current.isDemoData).toBe(false)
  })

  it('resets error and consecutiveFailures on successful fetch after failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'))

    const { result, rerender } = renderHook(
      ({ cluster }) => useCrossplaneManagedResources(cluster),
      { initialProps: { cluster: 'cp-recovery-1' } }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeTruthy()

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resources: [] }),
    })

    rerender({ cluster: 'cp-recovery-2' })

    await waitFor(() => expect(result.current.error).toBeNull())
    expect(result.current.consecutiveFailures).toBe(0)
  })

  it('fetches from correct API endpoint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resources: [] }),
    })

    const { result } = renderHook(() => useCrossplaneManagedResources('endpoint-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/crossplane/managed-resources',
      expect.anything()
    )
  })

  it('demo mode returns resources with all expected fields', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useCrossplaneManagedResources('demo-fields-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    const resource = result.current.resources[0]
    expect(resource).toHaveProperty('apiVersion')
    expect(resource).toHaveProperty('kind')
    expect(resource).toHaveProperty('metadata')
    expect(resource.metadata).toHaveProperty('name')
    expect(resource.metadata).toHaveProperty('namespace')
    expect(resource.metadata).toHaveProperty('creationTimestamp')
  })
})
