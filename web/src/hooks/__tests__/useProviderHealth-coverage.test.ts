import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

let mockClusters: Array<{ name: string; server?: string; namespaces?: string[]; user?: string }> = []
let mockIsInClusterMode = false
let mockKagentiStatus: {
  available: boolean
  reason?: string
  llm_provider?: string
  api_key_configured?: boolean
  configured_providers?: string[]
} = {
  available: false,
  configured_providers: [],
}
let capturedFetcher: (() => Promise<unknown>) | null = null
let capturedDemoWhenEmpty: boolean | undefined

const mockCacheResult = {
  data: [] as Array<Record<string, unknown>>,
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  isFailed: false,
  consecutiveFailures: 0,
  refetch: vi.fn(),
}

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: [RequestInfo | URL, RequestInit?]) => globalThis.fetch(...args),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    LOCAL_AGENT_HTTP_URL: 'http://localhost:8765',
  }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    FETCH_DEFAULT_TIMEOUT_MS: 10_000,
  }
})

vi.mock('../mcp/clusters', () => ({
  useClusters: () => ({ clusters: mockClusters, deduplicatedClusters: mockClusters }),
}))

vi.mock('../../lib/cache', () => ({
  useCache: (opts: { fetcher: () => Promise<unknown>; demoWhenEmpty?: boolean }) => {
    capturedFetcher = opts.fetcher
    capturedDemoWhenEmpty = opts.demoWhenEmpty
    return {
      ...mockCacheResult,
      data: mockCacheResult.data,
    }
  },
}))

vi.mock('../../components/ui/CloudProviderIcon', () => ({
  detectCloudProvider: (name: string, server?: string) => {
    if (name.includes('eks') || (server && server.includes('amazonaws'))) return 'eks'
    if (name.includes('gke') || (server && server.includes('googleapis'))) return 'gke'
    if (name.includes('aks') || (server && server.includes('azure'))) return 'aks'
    if (name.includes('openshift')) return 'openshift'
    if (name.includes('kind')) return 'kind'
    if (name.includes('minikube')) return 'minikube'
    if (name.includes('k3s')) return 'k3s'
    return 'kubernetes'
  },
  getProviderLabel: (provider: string) => {
    const labels: Record<string, string> = {
      eks: 'AWS EKS',
      gke: 'Google GKE',
      aks: 'Azure AKS',
      openshift: 'OpenShift',
    }
    return labels[provider] || provider
  },
}))

vi.mock('../useBackendHealth', () => ({
  isInClusterMode: () => mockIsInClusterMode,
}))

vi.mock('../../lib/kagentiProviderBackend', () => ({
  fetchKagentiProviderStatus: vi.fn(async () => mockKagentiStatus),
}))

import { fetchKagentiProviderStatus } from '../../lib/kagentiProviderBackend'
import { useProviderHealth } from '../useProviderHealth'

const originalFetch = globalThis.fetch

beforeEach(() => {
  mockClusters = []
  mockIsInClusterMode = false
  mockKagentiStatus = {
    available: false,
    configured_providers: [],
  }
  capturedFetcher = null
  capturedDemoWhenEmpty = undefined
  mockCacheResult.data = []
  mockCacheResult.isLoading = false
  mockCacheResult.isRefreshing = false
  mockCacheResult.isDemoFallback = false
  mockCacheResult.isFailed = false
  mockCacheResult.consecutiveFailures = 0
  mockCacheResult.refetch = vi.fn()
  vi.clearAllMocks()
  globalThis.fetch = vi.fn().mockRejectedValue(new Error('unmocked fetch'))
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

async function invokeProviderFetcher(): Promise<Array<Record<string, unknown>>> {
  renderHook(() => useProviderHealth())
  expect(capturedFetcher).not.toBeNull()
  return capturedFetcher!() as Promise<Array<Record<string, unknown>>>
}

describe('fetchProviders — AI providers', () => {
  it('returns configured valid keys as operational providers', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        keys: [{ provider: 'anthropic', displayName: 'Anthropic', configured: true, valid: true }],
        configPath: '/fake',
      }),
    })

    const providers = await invokeProviderFetcher()
    expect(providers).toEqual([
      expect.objectContaining({
        id: 'anthropic',
        name: 'Anthropic (Claude)',
        category: 'ai',
        status: 'operational',
        configured: true,
        detail: 'API key configured and valid',
        statusUrl: 'https://status.claude.com',
      }),
    ])
  })

  it('returns configured invalid keys as down with the provider error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        keys: [{ provider: 'openai', displayName: 'OpenAI', configured: true, valid: false, error: 'Invalid API key' }],
        configPath: '/fake',
      }),
    })

    const providers = await invokeProviderFetcher()
    expect(providers).toEqual([
      expect.objectContaining({
        id: 'openai',
        status: 'down',
        detail: 'Invalid API key',
      }),
    ])
  })

  it('treats configured keys without validity metadata as operational', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        keys: [{ provider: 'google', displayName: 'Google', configured: true }],
        configPath: '/fake',
      }),
    })

    const providers = await invokeProviderFetcher()
    expect(providers).toEqual([
      expect.objectContaining({
        id: 'google',
        status: 'operational',
        detail: 'API key configured',
      }),
    ])
  })

  it('skips unconfigured AI providers', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        keys: [
          { provider: 'anthropic', displayName: 'Anthropic', configured: false },
          { provider: 'openai', displayName: 'OpenAI', configured: false },
        ],
        configPath: '/fake',
      }),
    })

    const providers = await invokeProviderFetcher()
    expect(providers).toEqual([])
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('normalizes provider ids and deduplicates anthropic aliases', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        keys: [
          { provider: 'anthropic', displayName: 'Anthropic (Claude)', configured: true, valid: true },
          { provider: 'claude', displayName: 'Claude', configured: true, valid: true },
          { provider: 'gemini', displayName: 'Gemini', configured: true, valid: true },
          { provider: 'anthropic-local', displayName: 'Local', configured: true },
        ],
        configPath: '/fake',
      }),
    })

    const providers = await invokeProviderFetcher()
    expect(providers.filter(provider => provider.id === 'anthropic')).toHaveLength(1)
    expect(providers).toContainEqual(expect.objectContaining({ id: 'google', name: 'Google (Gemini)' }))
    expect(providers).toContainEqual(expect.objectContaining({ id: 'anthropic-local', name: 'Claude Code (Local)' }))
  })
})

describe('fetchProviders — cloud providers', () => {
  it('detects cloud providers from cluster distributions and counts them', async () => {
    mockClusters = [
      { name: 'eks-prod', server: 'https://eks.amazonaws.com' },
      { name: 'eks-staging', server: 'https://eks.amazonaws.com/2' },
      { name: 'gke-main', server: 'https://gke.googleapis.com' },
      { name: 'kind-local' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ keys: [], configPath: '/fake' }),
    })

    const providers = await invokeProviderFetcher()
    expect(providers).toContainEqual(expect.objectContaining({
      id: 'eks',
      category: 'cloud',
      detail: '2 clusters detected',
      status: 'operational',
      configured: true,
      statusUrl: 'https://health.aws.amazon.com/health/status',
    }))
    expect(providers).toContainEqual(expect.objectContaining({
      id: 'gke',
      category: 'cloud',
      detail: '1 cluster detected',
    }))
    expect(providers.find(provider => provider.id === 'kind')).toBeUndefined()
  })

  it('returns AI and cloud providers together', async () => {
    mockClusters = [
      { name: 'eks-prod', server: 'https://eks.amazonaws.com' },
      { name: 'aks-staging', server: 'https://azure.example' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        keys: [
          { provider: 'anthropic', displayName: 'Anthropic', configured: true, valid: true },
          { provider: 'openai', displayName: 'OpenAI', configured: true, valid: true },
        ],
        configPath: '/fake',
      }),
    })

    const providers = await invokeProviderFetcher()
    expect(providers.filter(provider => provider.category === 'ai')).toHaveLength(2)
    expect(providers.filter(provider => provider.category === 'cloud')).toHaveLength(2)
  })

  it('uses Kagenti status for AI providers and still derives cloud providers in cluster mode', async () => {
    mockIsInClusterMode = true
    mockClusters = [{ name: 'eks-prod', server: 'https://eks.amazonaws.com' }]
    mockKagentiStatus = {
      available: true,
      llm_provider: 'anthropic',
      api_key_configured: true,
      configured_providers: ['anthropic', 'openai'],
    }
    globalThis.fetch = vi.fn()

    const providers = await invokeProviderFetcher()

    expect(vi.mocked(fetchKagentiProviderStatus)).toHaveBeenCalledTimes(1)
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(providers).toContainEqual(expect.objectContaining({
      id: 'anthropic',
      category: 'ai',
      status: 'operational',
      detail: 'API key configured',
    }))
    expect(providers).toContainEqual(expect.objectContaining({
      id: 'openai',
      category: 'ai',
      status: 'operational',
    }))
    expect(providers).toContainEqual(expect.objectContaining({
      id: 'eks',
      category: 'cloud',
      detail: '1 cluster detected',
    }))
  })
})

describe('fetchProviders — error handling', () => {
  it('still returns cloud providers when the keys request fails', async () => {
    mockClusters = [{ name: 'openshift-prod' }]
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('agent unreachable'))

    const providers = await invokeProviderFetcher()
    expect(providers).toEqual([
      expect.objectContaining({
        id: 'openshift',
        category: 'cloud',
        detail: '1 cluster detected',
      }),
    ])
  })

  it('still returns cloud providers when the keys response is not ok', async () => {
    mockClusters = [{ name: 'eks-prod', server: 'https://eks.amazonaws.com' }]
    globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 })

    const providers = await invokeProviderFetcher()
    expect(providers).toEqual([
      expect.objectContaining({
        id: 'eks',
        category: 'cloud',
      }),
    ])
  })

  it('handles null key arrays gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ keys: null, configPath: '/fake' }),
    })

    const providers = await invokeProviderFetcher()
    expect(providers).toEqual([])
  })
})

describe('useProviderHealth hook integration', () => {
  it('captures the fetcher from useCache', () => {
    renderHook(() => useProviderHealth())
    expect(capturedFetcher).toBeInstanceOf(Function)
  })

  it('disables demoWhenEmpty in cluster mode', () => {
    mockIsInClusterMode = true

    renderHook(() => useProviderHealth())

    expect(capturedDemoWhenEmpty).toBe(false)
  })

  it('suppresses demo fallback while loading', () => {
    mockCacheResult.isLoading = true
    mockCacheResult.isDemoFallback = true

    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.isDemoFallback).toBe(false)
  })

  it('exposes demo fallback after loading completes', () => {
    mockCacheResult.isDemoFallback = true

    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.isDemoFallback).toBe(true)
  })

  it('keeps demoWhenEmpty enabled outside cluster mode', () => {
    renderHook(() => useProviderHealth())

    expect(capturedDemoWhenEmpty).toBe(true)
  })

  it('splits cached providers into aiProviders and cloudProviders', () => {
    mockCacheResult.data = [
      { id: 'anthropic', name: 'Anthropic', category: 'ai', status: 'operational', configured: true },
      { id: 'eks', name: 'AWS EKS', category: 'cloud', status: 'operational', configured: true },
      { id: 'openai', name: 'OpenAI', category: 'ai', status: 'degraded', configured: true },
    ]

    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.aiProviders).toHaveLength(2)
    expect(result.current.cloudProviders).toHaveLength(1)
  })

  it('refetches when the cluster count changes after the first render', () => {
    mockClusters = [{ name: 'eks-prod', server: 'https://eks.amazonaws.com' }]
    const { rerender } = renderHook(() => useProviderHealth())

    expect(mockCacheResult.refetch).not.toHaveBeenCalled()

    mockClusters = [
      { name: 'eks-prod', server: 'https://eks.amazonaws.com' },
      { name: 'gke-main', server: 'https://gke.googleapis.com' },
    ]
    rerender()

    expect(mockCacheResult.refetch).toHaveBeenCalledTimes(1)
  })
})
