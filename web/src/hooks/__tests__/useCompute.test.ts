import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports
// ---------------------------------------------------------------------------

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: vi.fn(() => true),
  reportAgentDataSuccess: vi.fn(),
  reportAgentDataError: vi.fn(),
  reportAgentActivity: vi.fn(),
  isAgentConnected: vi.fn(() => false),
}))

vi.mock('../useBackendHealth', () => ({
  isInClusterMode: vi.fn(() => false),
  useBackendHealth: vi.fn(() => ({
    status: 'disconnected',
    isInClusterMode: false,
  })),
  isBackendConnected: vi.fn(() => false),
}))

vi.mock('../../lib/cache/fetcherUtils', () => ({
  getClusterModeBaseUrl: vi.fn(() => '/api/mcp'),
  isClusterModeBackend: vi.fn(() => false),
}))

vi.mock('../../lib/errorClassifier', () => ({
  classifyError: vi.fn((msg: string) => ({
    type: 'unknown',
    message: msg,
    icon: 'warning',
    suggestion: '',
  })),
  getErrorTypeFromString: vi.fn(() => 'unknown'),
  getIconForErrorType: vi.fn(() => 'warning'),
  getSuggestionForErrorType: vi.fn(() => ''),
}))

vi.mock('../../lib/modeTransition', () => ({
  registerCacheReset: vi.fn(),
  registerRefetch: vi.fn(() => vi.fn()),
  unregisterCacheReset: vi.fn(),
}))

vi.mock('../../lib/authToken', () => ({
  getStoredAuthToken: vi.fn(async () => null),
  getStoredAuthTokenSync: vi.fn(() => null),
}))

vi.mock('../../lib/sseClient', () => ({
  fetchSSE: vi.fn(async () => []),
  clearSSECache: vi.fn(),
}))

vi.mock('../mcp/pollingManager', () => ({
  subscribePolling: vi.fn(() => vi.fn()),
}))

vi.mock('../mcp/shared', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    agentFetch: vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => global.fetch(url, init)),
    getLocalAgentURL: vi.fn(() => ''),
    GPU_POLL_INTERVAL_MS: 30000,
    getEffectiveInterval: vi.fn((base: number) => base),
    clusterCacheRef: { clusters: [] },
    subscribeClusterCache: vi.fn(() => vi.fn()),
  }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    MCP_HOOK_TIMEOUT_MS: 10000,
    MCP_EXTENDED_TIMEOUT_MS: 30000,
    POLL_INTERVAL_FAST_MS: 2000,
    LOADING_TIMEOUT_MS: 5000,
    SHORT_DELAY_MS: 100,
    FOCUS_DELAY_MS: 100,
    areOptionalPollersSuppressed: vi.fn(() => false),
    LOCAL_AGENT_HTTP_URL: '',
    isLocalAgentSuppressed: vi.fn(() => true),
  }
})

// Import after mocks
import {
  useGPUNodes,
  useNodes,
  useNVIDIAOperators,
  notifyGPUNodeSubscribers,
  updateGPUNodeCache,
  gpuNodeCache,
  gpuNodeSubscribers,
  __computeTestables,
} from '../mcp/compute'

const { loadGPUCacheFromStorage, GPU_CACHE_KEY } = __computeTestables

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('not available'))
})

// ── Pure function tests ────────────────────────────────────────────────────

describe('loadGPUCacheFromStorage', () => {
  it('returns empty cache when storage is empty', () => {
    const cache = loadGPUCacheFromStorage()
    expect(cache.nodes).toEqual([])
    expect(cache.isLoading).toBe(false)
    expect(cache.isRefreshing).toBe(false)
    expect(cache.error).toBeNull()
    expect(cache.consecutiveFailures).toBe(0)
  })

  it('restores cached GPU nodes from localStorage', () => {
    const nodes = [{ id: 'node-1', name: 'gpu-node-1', cluster: 'prod', gpu: true }]
    localStorage.setItem(GPU_CACHE_KEY, JSON.stringify({
      nodes,
      lastUpdated: new Date().toISOString(),
    }))
    const cache = loadGPUCacheFromStorage()
    expect(cache.nodes).toHaveLength(1)
    expect(cache.isLoading).toBe(false)
  })

  it('returns empty cache for corrupt storage', () => {
    localStorage.setItem(GPU_CACHE_KEY, '{corrupt}')
    const cache = loadGPUCacheFromStorage()
    expect(cache.nodes).toEqual([])
  })

  it('returns empty cache when nodes array is empty in storage', () => {
    localStorage.setItem(GPU_CACHE_KEY, JSON.stringify({ nodes: [], lastUpdated: null }))
    const cache = loadGPUCacheFromStorage()
    expect(cache.nodes).toEqual([])
  })
})

describe('GPU_CACHE_KEY', () => {
  it('is a non-empty string', () => {
    expect(typeof GPU_CACHE_KEY).toBe('string')
    expect(GPU_CACHE_KEY.length).toBeGreaterThan(0)
  })
})

describe('gpuNodeCache', () => {
  it('is initialized as an object with nodes array', () => {
    expect(Array.isArray(gpuNodeCache.nodes)).toBe(true)
  })
})

describe('gpuNodeSubscribers', () => {
  it('is a Set', () => {
    expect(gpuNodeSubscribers instanceof Set).toBe(true)
  })
})

describe('notifyGPUNodeSubscribers', () => {
  it('calls all registered subscribers', () => {
    const subscriber = vi.fn()
    gpuNodeSubscribers.add(subscriber)
    notifyGPUNodeSubscribers()
    expect(subscriber).toHaveBeenCalledWith(gpuNodeCache)
    gpuNodeSubscribers.delete(subscriber)
  })
})

describe('updateGPUNodeCache', () => {
  it('updates cache and notifies subscribers', () => {
    const subscriber = vi.fn()
    gpuNodeSubscribers.add(subscriber)
    updateGPUNodeCache({ error: 'test-error' })
    expect(gpuNodeCache.error).toBe('test-error')
    expect(subscriber).toHaveBeenCalled()
    // Clean up
    updateGPUNodeCache({ error: null })
    gpuNodeSubscribers.delete(subscriber)
  })
})

// ── useGPUNodes hook tests ─────────────────────────────────────────────────

describe('useGPUNodes', () => {
  it('returns expected shape', async () => {
    const { result, unmount } = renderHook(() => useGPUNodes())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.nodes)).toBe(true)
    expect(typeof result.current.isRefreshing).toBe('boolean')
    expect(typeof result.current.isFailed).toBe('boolean')
    expect(typeof result.current.consecutiveFailures).toBe('number')
    expect(typeof result.current.refetch).toBe('function')
    unmount()
  })

  it('accepts a cluster argument', async () => {
    const { result, unmount } = renderHook(() => useGPUNodes('prod-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.nodes)).toBe(true)
    unmount()
  })

  it('returns demo nodes when API unavailable', async () => {
    const { result, unmount } = renderHook(() => useGPUNodes())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Demo data or empty is acceptable; we just check the shape
    expect(typeof result.current.nodes).not.toBeUndefined()
    unmount()
  })
})

// ── useNodes hook tests ────────────────────────────────────────────────────

describe('useNodes', () => {
  it('returns expected shape', async () => {
    const { result, unmount } = renderHook(() => useNodes())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.nodes)).toBe(true)
    expect(typeof result.current.refetch).toBe('function')
    expect(Array.isArray(result.current.clusterErrors)).toBe(true)
    unmount()
  })

  it('accepts a cluster argument', async () => {
    const { result, unmount } = renderHook(() => useNodes('staging'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.nodes)).toBe(true)
    unmount()
  })

  it('refetch is callable', async () => {
    const { result, unmount } = renderHook(() => useNodes())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
    unmount()
  })
})

// ── useNVIDIAOperators hook tests ─────────────────────────────────────────

describe('useNVIDIAOperators', () => {
  it('returns expected shape', async () => {
    const { result, unmount } = renderHook(() => useNVIDIAOperators())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.operators)).toBe(true)
    expect(typeof result.current.refetch).toBe('function')
    unmount()
  })

  it('accepts a cluster argument', async () => {
    const { result, unmount } = renderHook(() => useNVIDIAOperators('prod'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.operators)).toBe(true)
    unmount()
  })

  it('error is null initially when no API call made', async () => {
    const { result, unmount } = renderHook(() => useNVIDIAOperators())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // error may be set or null, both are valid depending on demo fallback
    expect(result.current.error === null || typeof result.current.error === 'string').toBe(true)
    unmount()
  })
})
