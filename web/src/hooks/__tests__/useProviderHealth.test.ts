import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------- Mock setup ----------

const mockClusters: Array<{ name: string; server?: string; namespaces?: string[]; user?: string }> = []

const mockUseCacheResult = {
  data: [],
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  isFailed: false,
  consecutiveFailures: 0,
  refetch: vi.fn(),
}

vi.mock('../useLocalAgent', () => ({
    createCachedHook: vi.fn(),
  isAgentUnavailable: vi.fn(() => true),
  reportAgentDataSuccess: vi.fn(),
  reportAgentDataError: vi.fn(),
}))

vi.mock('../useDemoMode', () => ({
    createCachedHook: vi.fn(),
  getDemoMode: vi.fn(() => false),
  useDemoMode: vi.fn(() => ({ isDemoMode: false })),
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
  QUICK_ABORT_TIMEOUT_MS: 2_000,
} })

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8765',
} })

vi.mock('../mcp/clusters', () => ({
    createCachedHook: vi.fn(),
  useClusters: () => ({ clusters: mockClusters }),
}))

vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: () => ({
    ...mockUseCacheResult,
    data: mockUseCacheResult.data,
  }),
}))

vi.mock('../../components/ui/CloudProviderIcon', () => ({
    createCachedHook: vi.fn(),
  detectCloudProvider: (name: string) => {
    if (name.includes('eks')) return 'eks'
    if (name.includes('gke')) return 'gke'
    if (name.includes('aks')) return 'aks'
    if (name.includes('openshift')) return 'openshift'
    return 'kubernetes'
  },
  getProviderLabel: (provider: string) => {
    const labels: Record<string, string> = { eks: 'AWS EKS', gke: 'Google GKE', aks: 'Azure AKS', openshift: 'OpenShift' }
    return labels[provider] || provider
  },
}))

import { useProviderHealth } from '../useProviderHealth'
import type { ProviderHealthInfo } from '../useProviderHealth'

// ---------- Tests ----------

describe('useProviderHealth', () => {
  beforeEach(() => {
    mockClusters.length = 0
    vi.clearAllMocks()
    mockUseCacheResult.data = []
    mockUseCacheResult.isLoading = false
    mockUseCacheResult.isRefreshing = false
    mockUseCacheResult.isDemoFallback = false
    mockUseCacheResult.isFailed = false
    mockUseCacheResult.consecutiveFailures = 0
  })

  // --- Basic shape ---
  it('returns expected shape', () => {
    const { result } = renderHook(() => useProviderHealth())
    expect(result.current).toHaveProperty('providers')
    expect(result.current).toHaveProperty('aiProviders')
    expect(result.current).toHaveProperty('cloudProviders')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('refetch')
  })

  it('returns empty arrays when no data', () => {
    const { result } = renderHook(() => useProviderHealth())
    expect(Array.isArray(result.current.providers)).toBe(true)
    expect(Array.isArray(result.current.aiProviders)).toBe(true)
    expect(Array.isArray(result.current.cloudProviders)).toBe(true)
  })

  // --- aiProviders / cloudProviders split ---
  it('separates AI and cloud providers', () => {
    mockUseCacheResult.data = [
      { id: 'anthropic', name: 'Anthropic', category: 'ai', status: 'operational', configured: true },
      { id: 'eks', name: 'AWS EKS', category: 'cloud', status: 'operational', configured: true },
    ] as ProviderHealthInfo[]

    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.aiProviders.length).toBe(1)
    expect(result.current.aiProviders[0].id).toBe('anthropic')
    expect(result.current.cloudProviders.length).toBe(1)
    expect(result.current.cloudProviders[0].id).toBe('eks')
  })

  // --- Loading state ---
  it('passes through loading state', () => {
    mockUseCacheResult.isLoading = true
    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.isLoading).toBe(true)
  })

  // --- isDemoFallback while loading ---
  it('isDemoFallback is false while still loading', () => {
    mockUseCacheResult.isLoading = true
    mockUseCacheResult.isDemoFallback = true
    const { result } = renderHook(() => useProviderHealth())
    // effectiveIsDemoFallback = isDemoFallback && !isLoading
    expect(result.current.isDemoFallback).toBe(false)
  })

  it('isDemoFallback is true when not loading and demo fallback', () => {
    mockUseCacheResult.isLoading = false
    mockUseCacheResult.isDemoFallback = true
    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.isDemoFallback).toBe(true)
  })

  // --- Failed state ---
  it('passes through isFailed and consecutiveFailures', () => {
    mockUseCacheResult.isFailed = true
    mockUseCacheResult.consecutiveFailures = 3
    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.isFailed).toBe(true)
    expect(result.current.consecutiveFailures).toBe(3)
  })

  // --- refetch ---
  it('exposes refetch function', () => {
    const { result } = renderHook(() => useProviderHealth())
    expect(typeof result.current.refetch).toBe('function')
  })

  // --- isRefreshing state ---
  it('passes through isRefreshing state', () => {
    mockUseCacheResult.isRefreshing = true
    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.isRefreshing).toBe(true)
  })

  // --- Multiple AI providers ---
  it('correctly filters multiple AI providers', () => {
    mockUseCacheResult.data = [
      { id: 'anthropic', name: 'Anthropic (Claude)', category: 'ai', status: 'operational', configured: true },
      { id: 'openai', name: 'OpenAI', category: 'ai', status: 'degraded', configured: true },
      { id: 'google', name: 'Google (Gemini)', category: 'ai', status: 'unknown', configured: false },
    ] as ProviderHealthInfo[]

    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.aiProviders.length).toBe(3)
    expect(result.current.cloudProviders.length).toBe(0)
    expect(result.current.providers.length).toBe(3)
  })

  // --- Multiple cloud providers ---
  it('correctly filters multiple cloud providers', () => {
    mockUseCacheResult.data = [
      { id: 'eks', name: 'AWS EKS', category: 'cloud', status: 'operational', configured: true },
      { id: 'gke', name: 'Google GKE', category: 'cloud', status: 'operational', configured: true },
      { id: 'aks', name: 'Azure AKS', category: 'cloud', status: 'degraded', configured: true },
    ] as ProviderHealthInfo[]

    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.cloudProviders.length).toBe(3)
    expect(result.current.aiProviders.length).toBe(0)
  })

  // --- Mixed providers ---
  it('handles mixed AI and cloud providers', () => {
    mockUseCacheResult.data = [
      { id: 'anthropic', name: 'Anthropic', category: 'ai', status: 'operational', configured: true },
      { id: 'openai', name: 'OpenAI', category: 'ai', status: 'operational', configured: true },
      { id: 'eks', name: 'AWS EKS', category: 'cloud', status: 'operational', configured: true },
      { id: 'gke', name: 'Google GKE', category: 'cloud', status: 'operational', configured: true },
      { id: 'openshift', name: 'OpenShift', category: 'cloud', status: 'degraded', configured: true },
    ] as ProviderHealthInfo[]

    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.aiProviders.length).toBe(2)
    expect(result.current.cloudProviders.length).toBe(3)
    expect(result.current.providers.length).toBe(5)
  })

  // --- Provider statuses ---
  it('preserves provider status values', () => {
    mockUseCacheResult.data = [
      { id: 'anthropic', name: 'Anthropic', category: 'ai', status: 'operational', configured: true },
      { id: 'openai', name: 'OpenAI', category: 'ai', status: 'degraded', configured: true },
      { id: 'eks', name: 'AWS EKS', category: 'cloud', status: 'down', configured: true },
      { id: 'gke', name: 'Google GKE', category: 'cloud', status: 'unknown', configured: false },
    ] as ProviderHealthInfo[]

    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.aiProviders[0].status).toBe('operational')
    expect(result.current.aiProviders[1].status).toBe('degraded')
    expect(result.current.cloudProviders[0].status).toBe('down')
    expect(result.current.cloudProviders[1].status).toBe('unknown')
  })

  // --- consecutiveFailures zero by default ---
  it('consecutiveFailures is 0 by default', () => {
    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.consecutiveFailures).toBe(0)
  })

  // --- Cleanup on unmount ---
  it('cleans up on unmount without throwing', () => {
    const { unmount } = renderHook(() => useProviderHealth())
    expect(() => unmount()).not.toThrow()
  })

  // --- Providers with statusUrl and detail ---
  it('preserves statusUrl and detail in provider data', () => {
    mockUseCacheResult.data = [
      {
        id: 'anthropic',
        name: 'Anthropic (Claude)',
        category: 'ai',
        status: 'operational',
        configured: true,
        statusUrl: 'https://status.claude.com',
        detail: 'API key configured',
      },
    ] as ProviderHealthInfo[]

    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.providers[0].statusUrl).toBe('https://status.claude.com')
    expect(result.current.providers[0].detail).toBe('API key configured')
  })

  // --- Empty data arrays produce empty filtered arrays ---
  it('handles empty data from cache gracefully', () => {
    mockUseCacheResult.data = []
    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.providers).toEqual([])
    expect(result.current.aiProviders).toEqual([])
    expect(result.current.cloudProviders).toEqual([])
  })

  // --- Only AI providers returns empty cloud array ---
  it('returns empty cloudProviders when only AI providers exist', () => {
    mockUseCacheResult.data = [
      { id: 'anthropic', name: 'Anthropic', category: 'ai', status: 'operational', configured: true },
      { id: 'bob', name: 'Bob', category: 'ai', status: 'operational', configured: false },
    ] as ProviderHealthInfo[]
    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.aiProviders.length).toBe(2)
    expect(result.current.cloudProviders.length).toBe(0)
  })

  // --- Only cloud providers returns empty AI array ---
  it('returns empty aiProviders when only cloud providers exist', () => {
    mockUseCacheResult.data = [
      { id: 'eks', name: 'AWS EKS', category: 'cloud', status: 'operational', configured: true },
    ] as ProviderHealthInfo[]
    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.aiProviders.length).toBe(0)
    expect(result.current.cloudProviders.length).toBe(1)
  })

  // --- isDemoFallback = false when both flags false ---
  it('isDemoFallback is false when cache is not in demo fallback', () => {
    mockUseCacheResult.isLoading = false
    mockUseCacheResult.isDemoFallback = false
    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.isDemoFallback).toBe(false)
  })

  // --- Providers with all four status values ---
  it('correctly passes through all four HealthStatus values', () => {
    mockUseCacheResult.data = [
      { id: 'a', name: 'A', category: 'ai', status: 'operational', configured: true },
      { id: 'b', name: 'B', category: 'ai', status: 'degraded', configured: true },
      { id: 'c', name: 'C', category: 'cloud', status: 'down', configured: true },
      { id: 'd', name: 'D', category: 'cloud', status: 'unknown', configured: false },
    ] as ProviderHealthInfo[]

    const { result } = renderHook(() => useProviderHealth())
    const statuses = result.current.providers.map(p => p.status)
    expect(statuses).toEqual(['operational', 'degraded', 'down', 'unknown'])
  })

  // --- consecutiveFailures > 0 passed through ---
  it('passes high consecutiveFailures values correctly', () => {
    mockUseCacheResult.consecutiveFailures = 10
    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.consecutiveFailures).toBe(10)
  })

  // --- Rerender does not duplicate providers ---
  it('does not duplicate providers on rerender', () => {
    mockUseCacheResult.data = [
      { id: 'anthropic', name: 'Anthropic', category: 'ai', status: 'operational', configured: true },
    ] as ProviderHealthInfo[]

    const { result, rerender } = renderHook(() => useProviderHealth())
    expect(result.current.aiProviders.length).toBe(1)

    rerender()
    expect(result.current.aiProviders.length).toBe(1)
  })

  // --- Data change updates providers ---
  it('updates aiProviders when cache data changes between renders', () => {
    mockUseCacheResult.data = [
      { id: 'anthropic', name: 'Anthropic', category: 'ai', status: 'operational', configured: true },
    ] as ProviderHealthInfo[]

    const { result, rerender } = renderHook(() => useProviderHealth())
    expect(result.current.aiProviders.length).toBe(1)

    mockUseCacheResult.data = [
      { id: 'anthropic', name: 'Anthropic', category: 'ai', status: 'operational', configured: true },
      { id: 'openai', name: 'OpenAI', category: 'ai', status: 'degraded', configured: true },
    ] as ProviderHealthInfo[]
    rerender()
    expect(result.current.aiProviders.length).toBe(2)
  })

  // --- Provider configured = false ---
  it('preserves configured:false in provider data', () => {
    mockUseCacheResult.data = [
      { id: 'google', name: 'Google', category: 'ai', status: 'unknown', configured: false, detail: 'API key not configured' },
    ] as ProviderHealthInfo[]

    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.aiProviders[0].configured).toBe(false)
    expect(result.current.aiProviders[0].detail).toBe('API key not configured')
  })

  // --- Refreshing transitions ---
  it('tracks loading to refreshing transition', () => {
    mockUseCacheResult.isLoading = true
    mockUseCacheResult.isRefreshing = false
    const { result, rerender } = renderHook(() => useProviderHealth())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isRefreshing).toBe(false)

    mockUseCacheResult.isLoading = false
    mockUseCacheResult.isRefreshing = true
    rerender()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isRefreshing).toBe(true)
  })

  // --- isFailed with isDemoFallback ---
  it('can be both isFailed and isDemoFallback simultaneously', () => {
    mockUseCacheResult.isFailed = true
    mockUseCacheResult.isDemoFallback = true
    mockUseCacheResult.isLoading = false
    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.isFailed).toBe(true)
    expect(result.current.isDemoFallback).toBe(true)
  })

  // --- Many providers of same category ---
  it('handles large number of providers', () => {
    const PROVIDER_COUNT = 20
    const providers: ProviderHealthInfo[] = []
    for (let i = 0; i < PROVIDER_COUNT; i++) {
      providers.push({
        id: `cloud-${i}`,
        name: `Cloud Provider ${i}`,
        category: 'cloud',
        status: 'operational',
        configured: true,
      })
    }
    mockUseCacheResult.data = providers

    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.cloudProviders.length).toBe(PROVIDER_COUNT)
    expect(result.current.aiProviders.length).toBe(0)
  })
})
