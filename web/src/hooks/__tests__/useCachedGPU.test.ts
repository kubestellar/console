import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockUseCache } = vi.hoisted(() => ({
  mockUseCache: vi.fn(),
}))

vi.mock('../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../../lib/cache/fetcherUtils', () => ({
  fetchAPI: vi.fn(),
  fetchFromAllClusters: vi.fn(),
  fetchViaSSE: vi.fn(),
  getToken: vi.fn(() => null),
  AGENT_HTTP_TIMEOUT_MS: 30000,
}))

vi.mock('../../lib/constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
  AI_PREDICTION_TIMEOUT_MS: 30000,
}))

vi.mock('../useCachedData/demoData', () => ({
  getDemoGPUNodes: () => [],
  getDemoCachedGPUNodeHealth: () => [],
  getDemoCachedWarningEvents: () => [],
  HW_INITIAL_DATA: { status: 'unknown', clusters: [] },
  HW_DEMO_DATA: { status: 'ok', clusters: [] },
}))

vi.mock('../../lib/schemas', () => ({
  GPUNodesResponseSchema: {},
  GPUNodeHealthResponseSchema: {},
}))

vi.mock('../../lib/schemas/validate', () => ({
  validateArrayResponse: vi.fn((_, raw: unknown) => raw),
}))

import {
  useCachedGPUNodes,
  useCachedGPUNodeHealth,
  useCachedHardwareHealth,
  useCachedWarningEvents,
} from '../useCachedGPU'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultCache(overrides = {}) {
  return {
    data: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseCache.mockReturnValue(defaultCache())
})

// ---------------------------------------------------------------------------
// useCachedGPUNodes
// ---------------------------------------------------------------------------

describe('useCachedGPUNodes', () => {
  it('exposes gpuNodes and standard cache fields', () => {
    const { result } = renderHook(() => useCachedGPUNodes())
    // Hook exposes `nodes` (matches backend /api/mcp/gpu-nodes response shape),
    // not `gpuNodes`. See useCachedGPU.ts useCachedGPUNodes().
    expect(result.current).toHaveProperty('nodes')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('refetch')
  })

  it('gpuNodes aliases data', () => {
    const nodes = [{ name: 'gpu-0', cluster: 'c1', gpuCount: 4 }]
    mockUseCache.mockReturnValue(defaultCache({ data: nodes }))
    const { result } = renderHook(() => useCachedGPUNodes())
    expect(result.current.nodes).toEqual(nodes)
  })

  it('uses cluster in cache key when provided', () => {
    renderHook(() => useCachedGPUNodes('prod'))
    expect(mockUseCache.mock.calls[0][0].key).toContain('prod')
  })

  it('isLoading forwarded correctly', () => {
    mockUseCache.mockReturnValue(defaultCache({ isLoading: true }))
    const { result } = renderHook(() => useCachedGPUNodes())
    expect(result.current.isLoading).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// useCachedGPUNodeHealth
// ---------------------------------------------------------------------------

describe('useCachedGPUNodeHealth', () => {
  it('exposes healthStatuses field', () => {
    const { result } = renderHook(() => useCachedGPUNodeHealth())
    // Hook exposes `nodes` (matches backend /api/mcp/gpu-nodes/health response
    // shape), not `healthStatuses`. See useCachedGPU.ts useCachedGPUNodeHealth().
    expect(result.current).toHaveProperty('nodes')
    expect(Array.isArray(result.current.nodes)).toBe(true)
  })

  it('cluster key included when cluster provided', () => {
    renderHook(() => useCachedGPUNodeHealth('my-cluster'))
    expect(mockUseCache.mock.calls[0][0].key).toContain('my-cluster')
  })
})

// ---------------------------------------------------------------------------
// useCachedHardwareHealth
// ---------------------------------------------------------------------------

describe('useCachedHardwareHealth', () => {
  it('exposes data field with hardware health', () => {
    const hwData = { status: 'ok', clusters: [] }
    mockUseCache.mockReturnValue(defaultCache({ data: hwData }))
    const { result } = renderHook(() => useCachedHardwareHealth())
    expect(result.current.data).toEqual(hwData)
  })

  it('returns standard cache fields', () => {
    const { result } = renderHook(() => useCachedHardwareHealth())
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isDemoFallback')
  })
})

// ---------------------------------------------------------------------------
// useCachedWarningEvents
// ---------------------------------------------------------------------------

describe('useCachedWarningEvents', () => {
  it('exposes events field', () => {
    const events = [{ name: 'evt-1', message: 'OOMKilled', cluster: 'c1', namespace: 'default', reason: 'OOMKilled', type: 'Warning', count: 1 }]
    mockUseCache.mockReturnValue(defaultCache({ data: events }))
    const { result } = renderHook(() => useCachedWarningEvents())
    expect(result.current).toHaveProperty('events')
    expect(result.current.events).toEqual(events)
  })

  it('cluster in cache key when provided', () => {
    renderHook(() => useCachedWarningEvents('prod-cluster'))
    expect(mockUseCache.mock.calls[0][0].key).toContain('prod-cluster')
  })
})
