import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Control variables for mocks
// ---------------------------------------------------------------------------

let mockDemoMode = false
let mockClusters: Array<{ name: string; server?: string; namespaces?: string[]; user?: string }> = []

/** Captured fetcher from useCache — lets us invoke fetchProviders directly */
let capturedFetcher: (() => Promise<unknown>) | null = null

const mockCacheResult = {
  data: [] as unknown[],
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  isFailed: false,
  consecutiveFailures: 0,
  refetch: vi.fn(),
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../useDemoMode', () => ({
  getDemoMode: () => mockDemoMode,
  useDemoMode: () => ({ isDemoMode: mockDemoMode }),
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
  useClusters: () => ({ clusters: mockClusters }),
}))

vi.mock('../../lib/cache', () => ({
  useCache: (opts: { fetcher: () => Promise<unknown>; demoData?: unknown[] }) => {
    capturedFetcher = opts.fetcher
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

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: vi.fn(() => true),
  reportAgentDataSuccess: vi.fn(),
  reportAgentDataError: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------

import { useProviderHealth } from '../useProviderHealth'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  mockDemoMode = false
  mockClusters = []
  capturedFetcher = null
  mockCacheResult.data = []
  mockCacheResult.isLoading = false
  mockCacheResult.isRefreshing = false
  mockCacheResult.isDemoFallback = false
  mockCacheResult.isFailed = false
  mockCacheResult.consecutiveFailures = 0
  vi.clearAllMocks()
  // Reset fetch to a default mock that rejects
  globalThis.fetch = vi.fn().mockRejectedValue(new Error('unmocked fetch'))
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// ---------------------------------------------------------------------------
// Helper: render the hook so useCache captures the fetcher, then invoke it
// ---------------------------------------------------------------------------

async function invokeProviderFetcher(): Promise<unknown> {
  renderHook(() => useProviderHealth())
  expect(capturedFetcher).not.toBeNull()
  return capturedFetcher!()
}

// ---------------------------------------------------------------------------
// Tests: checkStatuspageDirect (via checkServiceHealth fallback path)
// ---------------------------------------------------------------------------

describe('checkStatuspageDirect (via fetchProviders -> checkServiceHealth)', () => {
  it('maps indicator "none" to operational', async () => {
    mockDemoMode = false
    mockClusters = []

    // First fetch: /settings/keys — returns unconfigured anthropic
    // Second fetch: /providers/health — fails (so fallback to statuspage)
    // Third fetch: statuspage API — returns indicator "none"
    const fetchMock = vi.fn()
      // 1. /settings/keys
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [{ provider: 'anthropic', displayName: 'Anthropic', configured: false }],
          configPath: '/fake',
        }),
      })
      // 2. /providers/health — backend proxy (should be skipped in demo, but we're not in demo; let it fail)
      .mockRejectedValueOnce(new Error('backend down'))
      // 3. statuspage direct check for anthropic
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: { indicator: 'none' } }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; status: string }>
    const anthropic = providers.find(p => p.id === 'anthropic')
    expect(anthropic).toBeDefined()
    expect(anthropic!.status).toBe('operational')
  })

  it('maps indicator "minor" to degraded', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [{ provider: 'openai', displayName: 'OpenAI', configured: false }],
          configPath: '/fake',
        }),
      })
      .mockRejectedValueOnce(new Error('backend down'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: { indicator: 'minor' } }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; status: string }>
    const openai = providers.find(p => p.id === 'openai')
    expect(openai).toBeDefined()
    expect(openai!.status).toBe('degraded')
  })

  it('maps indicator "major" to degraded', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [{ provider: 'anthropic', displayName: 'Anthropic', configured: false }],
          configPath: '/fake',
        }),
      })
      .mockRejectedValueOnce(new Error('backend down'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: { indicator: 'major' } }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; status: string }>
    const anthropic = providers.find(p => p.id === 'anthropic')
    expect(anthropic!.status).toBe('degraded')
  })

  it('maps indicator "critical" to down', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [{ provider: 'anthropic', displayName: 'Anthropic', configured: false }],
          configPath: '/fake',
        }),
      })
      .mockRejectedValueOnce(new Error('backend down'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: { indicator: 'critical' } }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; status: string }>
    const anthropic = providers.find(p => p.id === 'anthropic')
    expect(anthropic!.status).toBe('down')
  })

  it('maps unknown indicator to unknown', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [{ provider: 'anthropic', displayName: 'Anthropic', configured: false }],
          configPath: '/fake',
        }),
      })
      .mockRejectedValueOnce(new Error('backend down'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: { indicator: 'banana' } }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; status: string }>
    const anthropic = providers.find(p => p.id === 'anthropic')
    expect(anthropic!.status).toBe('unknown')
  })

  it('returns unknown when statuspage response is not ok', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [{ provider: 'anthropic', displayName: 'Anthropic', configured: false }],
          configPath: '/fake',
        }),
      })
      .mockRejectedValueOnce(new Error('backend down'))
      .mockResolvedValueOnce({ ok: false })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; status: string }>
    const anthropic = providers.find(p => p.id === 'anthropic')
    expect(anthropic!.status).toBe('unknown')
  })

  it('returns unknown when statuspage fetch throws', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [{ provider: 'anthropic', displayName: 'Anthropic', configured: false }],
          configPath: '/fake',
        }),
      })
      .mockRejectedValueOnce(new Error('backend down'))
      .mockRejectedValueOnce(new Error('network error'))
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; status: string }>
    const anthropic = providers.find(p => p.id === 'anthropic')
    expect(anthropic!.status).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// Tests: checkServiceHealth — backend proxy path
// ---------------------------------------------------------------------------

describe('checkServiceHealth — backend proxy success', () => {
  it('uses backend proxy result and skips statuspage for covered providers', async () => {
    const fetchMock = vi.fn()
      // 1. /settings/keys — unconfigured anthropic
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [{ provider: 'anthropic', displayName: 'Anthropic', configured: false }],
          configPath: '/fake',
        }),
      })
      // 2. /providers/health — backend proxy succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          providers: [{ id: 'anthropic', status: 'degraded' }],
        }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; status: string }>
    const anthropic = providers.find(p => p.id === 'anthropic')
    expect(anthropic!.status).toBe('degraded')
    // Should NOT have called statuspage (only 2 fetch calls total)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('normalizes unknown backend status to unknown', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [{ provider: 'openai', displayName: 'OpenAI', configured: false }],
          configPath: '/fake',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          providers: [{ id: 'openai', status: 'banana_status' }],
        }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; status: string }>
    const openai = providers.find(p => p.id === 'openai')
    expect(openai!.status).toBe('unknown')
  })

  it('skips backend proxy in demo mode and goes directly to statuspage', async () => {
    mockDemoMode = true

    const fetchMock = vi.fn()
      // 1. /settings/keys — still called but will fail in demo
      .mockRejectedValueOnce(new Error('agent unreachable'))
    globalThis.fetch = fetchMock

    // No keys returned, no unconfigured providers, so no statuspage calls either
    const providers = await invokeProviderFetcher() as Array<{ id: string; status: string }>
    expect(providers).toEqual([])
    // Only 1 call: /settings/keys (which fails). No /providers/health call.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Tests: fetchProviders — AI provider key states
// ---------------------------------------------------------------------------

describe('fetchProviders — AI provider key configuration', () => {
  it('marks configured + valid key as operational', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [{ provider: 'anthropic', displayName: 'Anthropic (Claude)', configured: true, valid: true }],
          configPath: '/fake',
        }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; status: string; detail?: string; configured: boolean }>
    const anthropic = providers.find(p => p.id === 'anthropic')
    expect(anthropic!.status).toBe('operational')
    expect(anthropic!.detail).toBe('API key configured and valid')
    expect(anthropic!.configured).toBe(true)
  })

  it('marks configured + invalid key as down', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [{ provider: 'openai', displayName: 'OpenAI', configured: true, valid: false, error: 'Invalid API key' }],
          configPath: '/fake',
        }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; status: string; detail?: string }>
    const openai = providers.find(p => p.id === 'openai')
    expect(openai!.status).toBe('down')
    expect(openai!.detail).toBe('Invalid API key')
  })

  it('marks configured + invalid key with no error message as "API key invalid"', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [{ provider: 'openai', displayName: 'OpenAI', configured: true, valid: false }],
          configPath: '/fake',
        }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; detail?: string }>
    const openai = providers.find(p => p.id === 'openai')
    expect(openai!.detail).toBe('API key invalid')
  })

  it('marks configured + valid=undefined as operational with "API key configured"', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [{ provider: 'google', displayName: 'Google', configured: true }],
          configPath: '/fake',
        }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; status: string; detail?: string }>
    const google = providers.find(p => p.id === 'google')
    expect(google!.status).toBe('operational')
    expect(google!.detail).toBe('API key configured')
  })

  it('marks unconfigured key as unknown with "API key not configured"', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [{ provider: 'google', displayName: 'Google', configured: false }],
          configPath: '/fake',
        }),
      })
      // backend proxy for health check — fail
      .mockRejectedValueOnce(new Error('no backend'))
      // No STATUSPAGE_API entry for 'google', so no direct check happens
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; status: string; detail?: string; configured: boolean }>
    const google = providers.find(p => p.id === 'google')
    expect(google!.configured).toBe(false)
    // Google has no statuspage entry, so it stays at whatever checkServiceHealth sets (no entry = stays unknown from initial assignment in the unconfigured path, then health check won't have it)
    expect(google!.detail).toBe('API key not configured')
  })
})

// ---------------------------------------------------------------------------
// Tests: normalizeAIProvider dedup
// ---------------------------------------------------------------------------

describe('fetchProviders — AI provider normalization and dedup', () => {
  it('normalizes "claude" to "anthropic" and deduplicates', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [
            { provider: 'anthropic', displayName: 'Anthropic (Claude)', configured: true, valid: true },
            { provider: 'claude', displayName: 'Claude', configured: true, valid: true },
          ],
          configPath: '/fake',
        }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string }>
    const anthropicEntries = providers.filter(p => p.id === 'anthropic')
    // Should deduplicate — only one entry for anthropic
    expect(anthropicEntries).toHaveLength(1)
  })

  it('normalizes "gemini" to "google"', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [{ provider: 'gemini', displayName: 'Gemini', configured: true, valid: true }],
          configPath: '/fake',
        }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; name: string }>
    expect(providers[0].id).toBe('google')
    expect(providers[0].name).toBe('Google (Gemini)')
  })

  it('keeps "anthropic-local" as-is', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [{ provider: 'anthropic-local', displayName: 'Local', configured: true }],
          configPath: '/fake',
        }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; name: string }>
    expect(providers[0].id).toBe('anthropic-local')
    expect(providers[0].name).toBe('Claude Code (Local)')
  })
})

// ---------------------------------------------------------------------------
// Tests: fetchProviders — Cloud providers from clusters
// ---------------------------------------------------------------------------

describe('fetchProviders — cloud providers from cluster distributions', () => {
  it('detects cloud providers from clusters and counts them', async () => {
    mockClusters = [
      { name: 'eks-prod', server: 'https://eks.amazonaws.com' },
      { name: 'eks-staging', server: 'https://eks.amazonaws.com/2' },
      { name: 'gke-main', server: 'https://gke.googleapis.com' },
    ]

    const fetchMock = vi.fn()
      // /settings/keys — no AI providers
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ keys: [], configPath: '/fake' }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; category: string; detail?: string }>
    const cloudProviders = providers.filter(p => p.category === 'cloud')
    expect(cloudProviders.length).toBe(2) // eks and gke
    const eks = cloudProviders.find(p => p.id === 'eks')
    expect(eks).toBeDefined()
    expect(eks!.detail).toBe('2 clusters detected')
    const gke = cloudProviders.find(p => p.id === 'gke')
    expect(gke).toBeDefined()
    expect(gke!.detail).toBe('1 cluster detected')
  })

  it('skips generic/local providers (kind, minikube, k3s, kubernetes)', async () => {
    mockClusters = [
      { name: 'kind-local' },
      { name: 'minikube-dev' },
      { name: 'k3s-edge' },
      { name: 'my-kubernetes-cluster' },
    ]

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ keys: [], configPath: '/fake' }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; category: string }>
    const cloudProviders = providers.filter(p => p.category === 'cloud')
    expect(cloudProviders).toHaveLength(0)
  })

  it('returns empty cloud list when no clusters exist', async () => {
    mockClusters = []

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ keys: [], configPath: '/fake' }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string }>
    expect(providers).toHaveLength(0)
  })

  it('sets cloud provider status to operational and configured to true', async () => {
    mockClusters = [
      { name: 'openshift-prod' },
    ]

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ keys: [], configPath: '/fake' }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; status: string; configured: boolean; statusUrl?: string }>
    const openshift = providers.find(p => p.id === 'openshift')
    expect(openshift!.status).toBe('operational')
    expect(openshift!.configured).toBe(true)
    expect(openshift!.statusUrl).toBe('https://status.redhat.com')
  })
})

// ---------------------------------------------------------------------------
// Tests: fetchProviders — error handling
// ---------------------------------------------------------------------------

describe('fetchProviders — error handling', () => {
  it('returns empty AI providers when /settings/keys fetch fails', async () => {
    mockClusters = []
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('agent unreachable'))
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string }>
    expect(providers).toHaveLength(0)
  })

  it('returns empty AI providers when /settings/keys response is not ok', async () => {
    mockClusters = []
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string }>
    expect(providers).toHaveLength(0)
  })

  it('handles keys with null/empty providers array gracefully', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ keys: null, configPath: '/fake' }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string }>
    expect(providers).toHaveLength(0)
  })

  it('handles backend proxy returning non-ok status', async () => {
    const fetchMock = vi.fn()
      // /settings/keys
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [{ provider: 'anthropic', displayName: 'Anthropic', configured: false }],
          configPath: '/fake',
        }),
      })
      // /providers/health — 500
      .mockResolvedValueOnce({ ok: false, status: 500 })
      // statuspage fallback
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: { indicator: 'none' } }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; status: string }>
    const anthropic = providers.find(p => p.id === 'anthropic')
    expect(anthropic!.status).toBe('operational')
  })

  it('handles backend proxy with null providers array', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [{ provider: 'anthropic', displayName: 'Anthropic', configured: false }],
          configPath: '/fake',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ providers: null }),
      })
      // Falls through to statuspage since no providers were set in result map
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: { indicator: 'none' } }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; status: string }>
    const anthropic = providers.find(p => p.id === 'anthropic')
    expect(anthropic!.status).toBe('operational')
  })
})

// ---------------------------------------------------------------------------
// Tests: useProviderHealth hook — demo mode and effectiveIsDemoFallback
// ---------------------------------------------------------------------------

describe('useProviderHealth hook integration', () => {
  it('captures fetcher from useCache and it is callable', () => {
    renderHook(() => useProviderHealth())
    expect(capturedFetcher).toBeInstanceOf(Function)
  })

  it('effectiveIsDemoFallback is false while loading even if isDemoFallback is true', () => {
    mockCacheResult.isLoading = true
    mockCacheResult.isDemoFallback = true
    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.isDemoFallback).toBe(false)
  })

  it('effectiveIsDemoFallback is true when not loading and isDemoFallback is true', () => {
    mockCacheResult.isLoading = false
    mockCacheResult.isDemoFallback = true
    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.isDemoFallback).toBe(true)
  })

  it('splits providers into aiProviders and cloudProviders correctly', () => {
    mockCacheResult.data = [
      { id: 'anthropic', name: 'Anthropic', category: 'ai', status: 'operational', configured: true },
      { id: 'eks', name: 'AWS EKS', category: 'cloud', status: 'operational', configured: true },
      { id: 'openai', name: 'OpenAI', category: 'ai', status: 'degraded', configured: true },
    ]
    const { result } = renderHook(() => useProviderHealth())
    expect(result.current.aiProviders).toHaveLength(2)
    expect(result.current.cloudProviders).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Tests: checkServiceHealth — demo mode skips backend proxy
// ---------------------------------------------------------------------------

describe('checkServiceHealth — demo mode behavior', () => {
  it('in demo mode, unconfigured providers with statuspage get direct check', async () => {
    mockDemoMode = true

    const fetchMock = vi.fn()
      // /settings/keys — returns unconfigured anthropic
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [{ provider: 'anthropic', displayName: 'Anthropic', configured: false }],
          configPath: '/fake',
        }),
      })
      // In demo mode, /providers/health is SKIPPED, goes straight to statuspage
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: { indicator: 'none' } }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; status: string }>
    const anthropic = providers.find(p => p.id === 'anthropic')
    expect(anthropic!.status).toBe('operational')
    // Verify: 2 calls total (keys + statuspage), NOT 3 (no /providers/health)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// Tests: providers with no statuspage entry (e.g., bob, anthropic-local)
// ---------------------------------------------------------------------------

describe('fetchProviders — providers without statuspage entry', () => {
  it('provider without STATUSPAGE_API entry stays at initial status when unconfigured', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [{ provider: 'bob', displayName: 'Bob (Built-in)', configured: false }],
          configPath: '/fake',
        }),
      })
      // /providers/health — backend check for 'bob' — fails
      .mockRejectedValueOnce(new Error('no backend'))
      // No statuspage for 'bob', so no third call
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; status: string }>
    const bob = providers.find(p => p.id === 'bob')
    expect(bob).toBeDefined()
    // Bob has no statuspage, so checkServiceHealth can't check it and it stays unknown
    expect(bob!.status).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// Tests: Mixed AI + Cloud providers
// ---------------------------------------------------------------------------

describe('fetchProviders — combined AI and cloud providers', () => {
  it('returns both AI and cloud providers in one result', async () => {
    mockClusters = [
      { name: 'eks-prod' },
      { name: 'aks-staging' },
    ]

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          keys: [
            { provider: 'anthropic', displayName: 'Anthropic', configured: true, valid: true },
            { provider: 'openai', displayName: 'OpenAI', configured: true, valid: true },
          ],
          configPath: '/fake',
        }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; category: string }>
    const ai = providers.filter(p => p.category === 'ai')
    const cloud = providers.filter(p => p.category === 'cloud')
    expect(ai).toHaveLength(2)
    expect(cloud).toHaveLength(2)
    expect(ai.map(p => p.id)).toContain('anthropic')
    expect(ai.map(p => p.id)).toContain('openai')
    expect(cloud.map(p => p.id)).toContain('eks')
    expect(cloud.map(p => p.id)).toContain('aks')
  })
})

// ---------------------------------------------------------------------------
// Tests: Singular cluster detail text
// ---------------------------------------------------------------------------

describe('fetchProviders — cluster count pluralization', () => {
  it('uses singular "cluster" for count of 1', async () => {
    mockClusters = [{ name: 'eks-single' }]

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ keys: [], configPath: '/fake' }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; detail?: string }>
    const eks = providers.find(p => p.id === 'eks')
    expect(eks!.detail).toBe('1 cluster detected')
  })

  it('uses plural "clusters" for count > 1', async () => {
    mockClusters = [
      { name: 'eks-1' },
      { name: 'eks-2' },
      { name: 'eks-3' },
    ]

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ keys: [], configPath: '/fake' }),
      })
    globalThis.fetch = fetchMock

    const providers = await invokeProviderFetcher() as Array<{ id: string; detail?: string }>
    const eks = providers.find(p => p.id === 'eks')
    expect(eks!.detail).toBe('3 clusters detected')
  })
})
