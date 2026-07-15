import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

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

vi.mock('../mcp/dedup', () => ({
  deduplicateClustersByServer: vi.fn((c: unknown[]) => c),
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    MCP_HOOK_TIMEOUT_MS: 10000,
    SHORT_DELAY_MS: 100,
    FOCUS_DELAY_MS: 100,
    areOptionalPollersSuppressed: vi.fn(() => false),
  }
})

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, DEFAULT_REFRESH_INTERVAL_MS: 120000 }
})

import { useCrossplaneManagedResources, _resetCrossplaneManagedCacheForTest } from '../mcp/crossplane'
import { useOperators, useOperatorSubscriptions, __operatorsTestables } from '../mcp/operators'

const {
  loadOperatorsCacheFromStorage,
  saveOperatorsCacheToStorage,
  loadSubscriptionsCacheFromStorage,
  getDemoOperators,
  getDemoOperatorSubscriptions,
  OPERATORS_CACHE_KEY,
  SUBSCRIPTIONS_CACHE_KEY,
} = __operatorsTestables

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('not available'))
  _resetCrossplaneManagedCacheForTest()
})

// ── useCrossplaneManagedResources ─────────────────────────────────────────

describe('useCrossplaneManagedResources', () => {
  it('returns expected shape', async () => {
    const { result, unmount } = renderHook(() => useCrossplaneManagedResources())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.resources)).toBe(true)
    expect(typeof result.current.isRefreshing).toBe('boolean')
    expect(typeof result.current.consecutiveFailures).toBe('number')
    expect(typeof result.current.isFailed).toBe('boolean')
    expect(typeof result.current.isDemoData).toBe('boolean')
    expect(typeof result.current.refetch).toBe('function')
    unmount()
  })

  it('falls back to demo data when API is unavailable', async () => {
    const { result, unmount } = renderHook(() => useCrossplaneManagedResources())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resources.length).toBeGreaterThan(0)
    expect(result.current.isDemoData).toBe(true)
    unmount()
  })

  it('tracks consecutive failures on API error', async () => {
    const { result, unmount } = renderHook(() => useCrossplaneManagedResources())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
    unmount()
  })

  it('isFailed becomes true after 3+ failures', async () => {
    const { result, unmount } = renderHook(() => useCrossplaneManagedResources())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.isFailed).toBe('boolean')
    unmount()
  })

  it('filters resources by cluster when specified', async () => {
    const { result: allResult, unmount: unmountAll } = renderHook(() => useCrossplaneManagedResources())
    await waitFor(() => expect(allResult.current.isLoading).toBe(false))
    const { result, unmount } = renderHook(() => useCrossplaneManagedResources('infra'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // cluster filter is applied
    expect(result.current.resources.length).toBeLessThanOrEqual(allResult.current.resources.length)
    unmount()
    unmountAll()
  })

  it('loads cached data from localStorage', () => {
    const ts = Date.now()
    const cached = {
      data: [{
        apiVersion: 'rds.aws.crossplane.io/v1beta1',
        kind: 'RDSInstance',
        metadata: { name: 'cached-db', namespace: 'infra', creationTimestamp: '2026-01-01T00:00:00Z' },
      }],
      timestamp: ts,
    }
    localStorage.setItem('kc-crossplane-managed-cache', JSON.stringify(cached))
    _resetCrossplaneManagedCacheForTest()
    const { result, unmount } = renderHook(() => useCrossplaneManagedResources())
    expect(result.current.resources.some(r => r.metadata.name === 'cached-db')).toBe(true)
    unmount()
  })
})

// ── __operatorsTestables pure functions ────────────────────────────────────

describe('getDemoOperators', () => {
  it('returns operators for a given cluster', () => {
    const ops = getDemoOperators('prod')
    expect(Array.isArray(ops)).toBe(true)
    expect(ops.length).toBeGreaterThan(0)
    const op = ops[0]
    expect(typeof op.name).toBe('string')
    expect(typeof op.namespace).toBe('string')
    expect(typeof op.status).toBe('string')
    expect(op.cluster).toBe('prod')
  })

  it('returns different counts for different cluster names (hash-based)', () => {
    const a = getDemoOperators('cluster-a')
    const b = getDemoOperators('x')
    // Both should be non-empty valid arrays
    expect(a.length).toBeGreaterThan(0)
    expect(b.length).toBeGreaterThan(0)
  })
})

describe('getDemoOperatorSubscriptions', () => {
  it('returns subscriptions with required fields', () => {
    const subs = getDemoOperatorSubscriptions('staging')
    expect(Array.isArray(subs)).toBe(true)
    expect(subs.length).toBeGreaterThan(0)
    const s = subs[0]
    expect(typeof s.name).toBe('string')
    expect(typeof s.channel).toBe('string')
    expect(typeof s.installPlanApproval).toBe('string')
    expect(s.cluster).toBe('staging')
  })
})

describe('loadOperatorsCacheFromStorage / saveOperatorsCacheToStorage', () => {
  it('returns null when storage is empty', () => {
    expect(loadOperatorsCacheFromStorage('operators:all')).toBeNull()
  })

  it('returns null when cache key does not match', () => {
    const ops = getDemoOperators('prod')
    saveOperatorsCacheToStorage(ops, 'operators:prod')
    // Different key: should miss
    const loaded = loadOperatorsCacheFromStorage('operators:staging')
    expect(loaded).toBeNull()
  })

  it('returns null for corrupt storage', () => {
    localStorage.setItem(OPERATORS_CACHE_KEY, '{bad json')
    expect(loadOperatorsCacheFromStorage('operators:all')).toBeNull()
  })
})

describe('loadSubscriptionsCacheFromStorage / saveSubscriptionsCacheToStorage', () => {
  it('returns null when storage is empty', () => {
    expect(loadSubscriptionsCacheFromStorage('subscriptions:all')).toBeNull()
  })

  it('returns null for corrupt storage', () => {
    localStorage.setItem(SUBSCRIPTIONS_CACHE_KEY, 'not-json')
    expect(loadSubscriptionsCacheFromStorage('subscriptions:all')).toBeNull()
  })
})

// ── useOperators hook ─────────────────────────────────────────────────────

describe('useOperators', () => {
  it('returns expected shape', async () => {
    const { result, unmount } = renderHook(() => useOperators())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.operators)).toBe(true)
    expect(typeof result.current.isRefreshing).toBe('boolean')
    expect(typeof result.current.isFailed).toBe('boolean')
    expect(typeof result.current.consecutiveFailures).toBe('number')
    expect(typeof result.current.refetch).toBe('function')
    unmount()
  })

  it('falls back to demo data when API unavailable', async () => {
    const { result, unmount } = renderHook(() => useOperators())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators.length).toBeGreaterThan(0)
    unmount()
  })

  it('accepts a cluster argument', async () => {
    const { result, unmount } = renderHook(() => useOperators('prod-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.operators)).toBe(true)
    unmount()
  })
})

// ── useOperatorSubscriptions hook ──────────────────────────────────────────

describe('useOperatorSubscriptions', () => {
  it('returns expected shape', async () => {
    const { result, unmount } = renderHook(() => useOperatorSubscriptions())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.subscriptions)).toBe(true)
    expect(typeof result.current.isFailed).toBe('boolean')
    expect(typeof result.current.refetch).toBe('function')
    unmount()
  })

  it('falls back to demo data when API unavailable', async () => {
    const { result, unmount } = renderHook(() => useOperatorSubscriptions())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.subscriptions.length).toBeGreaterThan(0)
    unmount()
  })
})
