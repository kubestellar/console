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

import {
  useHelmReleases,
  useHelmHistory,
  useHelmValues,
  __helmTestables,
} from '../mcp/helm'

const {
  getDemoHelmReleases,
  getDemoHelmHistory,
  getDemoHelmValues,
  loadHelmReleasesFromStorage,
  saveHelmReleasesToStorage,
  HELM_RELEASES_CACHE_KEY,
  HELM_HISTORY_CACHE_KEY,
  HELM_CACHE_TTL_MS,
  HELM_REFRESH_INTERVAL_MS,
  _resetHelmReleasesCacheForTest,
} = __helmTestables

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('not available'))
  _resetHelmReleasesCacheForTest()
})

// ── Pure-function tests ────────────────────────────────────────────────────

describe('getDemoHelmReleases', () => {
  it('returns a non-empty array of HelmRelease objects', () => {
    const releases = getDemoHelmReleases()
    expect(Array.isArray(releases)).toBe(true)
    expect(releases.length).toBeGreaterThan(0)
    const r = releases[0]
    expect(typeof r.name).toBe('string')
    expect(typeof r.namespace).toBe('string')
    expect(typeof r.chart).toBe('string')
    expect(typeof r.status).toBe('string')
    expect(typeof r.cluster).toBe('string')
  })

  it('returns the same cached array on repeated calls', () => {
    const a = getDemoHelmReleases()
    const b = getDemoHelmReleases()
    expect(a).toBe(b)
  })

  it('includes releases across multiple clusters', () => {
    const releases = getDemoHelmReleases()
    const clusters = new Set(releases.map(r => r.cluster))
    expect(clusters.size).toBeGreaterThan(1)
  })
})

describe('getDemoHelmHistory', () => {
  it('returns an array of HelmHistoryEntry objects', () => {
    const history = getDemoHelmHistory()
    expect(Array.isArray(history)).toBe(true)
    expect(history.length).toBeGreaterThan(0)
    const h = history[0]
    expect(typeof h.revision).toBe('number')
    expect(typeof h.status).toBe('string')
    expect(typeof h.chart).toBe('string')
  })

  it('entries have revisions in descending order', () => {
    const history = getDemoHelmHistory()
    for (let i = 1; i < history.length; i++) {
      expect(history[i - 1].revision).toBeGreaterThan(history[i].revision)
    }
  })
})

describe('getDemoHelmValues', () => {
  it('returns a non-empty object', () => {
    const vals = getDemoHelmValues()
    expect(typeof vals).toBe('object')
    expect(vals).not.toBeNull()
    expect(Object.keys(vals).length).toBeGreaterThan(0)
  })

  it('contains replicaCount and image', () => {
    const vals = getDemoHelmValues()
    expect(vals).toHaveProperty('replicaCount')
    expect(vals).toHaveProperty('image')
  })
})

describe('loadHelmReleasesFromStorage / saveHelmReleasesToStorage', () => {
  it('returns empty array when storage is empty', () => {
    const result = loadHelmReleasesFromStorage()
    expect(result.data).toEqual([])
    expect(result.timestamp).toBe(0)
  })

  it('round-trips data through localStorage', () => {
    const ts = Date.now()
    const data = [{ name: 'nginx', namespace: 'default', revision: '1', updated: '', status: 'deployed', chart: 'nginx-1.0.0', app_version: '1.0', cluster: 'test' }]
    saveHelmReleasesToStorage(data, ts)
    const loaded = loadHelmReleasesFromStorage()
    expect(loaded.data).toHaveLength(1)
    expect(loaded.data[0].name).toBe('nginx')
    expect(loaded.timestamp).toBe(ts)
  })

  it('returns empty array for corrupt storage', () => {
    localStorage.setItem(HELM_RELEASES_CACHE_KEY, '{invalid json}')
    const result = loadHelmReleasesFromStorage()
    expect(result.data).toEqual([])
  })
})

describe('constants', () => {
  it('HELM_RELEASES_CACHE_KEY is a non-empty string', () => {
    expect(typeof HELM_RELEASES_CACHE_KEY).toBe('string')
    expect(HELM_RELEASES_CACHE_KEY.length).toBeGreaterThan(0)
  })

  it('HELM_HISTORY_CACHE_KEY differs from HELM_RELEASES_CACHE_KEY', () => {
    expect(HELM_HISTORY_CACHE_KEY).not.toBe(HELM_RELEASES_CACHE_KEY)
  })

  it('HELM_CACHE_TTL_MS is a positive number', () => {
    expect(typeof HELM_CACHE_TTL_MS).toBe('number')
    expect(HELM_CACHE_TTL_MS).toBeGreaterThan(0)
  })

  it('HELM_REFRESH_INTERVAL_MS is larger than HELM_CACHE_TTL_MS', () => {
    expect(HELM_REFRESH_INTERVAL_MS).toBeGreaterThan(HELM_CACHE_TTL_MS)
  })
})

// ── Hook shape tests ────────────────────────────────────────────────────────

describe('useHelmReleases', () => {
  it('returns expected shape', async () => {
    const { result, unmount } = renderHook(() => useHelmReleases())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.releases)).toBe(true)
    expect(typeof result.current.isRefreshing).toBe('boolean')
    expect(typeof result.current.consecutiveFailures).toBe('number')
    expect(typeof result.current.isFailed).toBe('boolean')
    expect(typeof result.current.refetch).toBe('function')
    unmount()
  })

  it('falls back to demo data when API is unavailable', async () => {
    const { result, unmount } = renderHook(() => useHelmReleases())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.releases.length).toBeGreaterThan(0)
    unmount()
  })

  it('filters releases by cluster when specified', async () => {
    const { result, unmount } = renderHook(() => useHelmReleases('eks-prod-us-east-1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const all = renderHook(() => useHelmReleases())
    await waitFor(() => expect(all.result.current.isLoading).toBe(false))
    // Filtered result should be a subset of all
    expect(result.current.releases.length).toBeLessThanOrEqual(all.result.current.releases.length)
    unmount()
    all.unmount()
  })

  it('loads releases from localStorage when cached', () => {
    const ts = Date.now()
    const data = [{ name: 'cached-release', namespace: 'default', revision: '1', updated: '', status: 'deployed', chart: 'cached-1.0.0', app_version: '1.0', cluster: 'test' }]
    saveHelmReleasesToStorage(data, ts)
    _resetHelmReleasesCacheForTest()
    const { result, unmount } = renderHook(() => useHelmReleases())
    expect(result.current.releases.some(r => r.name === 'cached-release')).toBe(true)
    unmount()
  })
})

describe('useHelmHistory', () => {
  it('returns expected shape', async () => {
    const { result, unmount } = renderHook(() => useHelmHistory('cluster', 'my-release', 'default'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.history)).toBe(true)
    expect(typeof result.current.isFailed).toBe('boolean')
    expect(typeof result.current.refetch).toBe('function')
    unmount()
  })

  it('returns empty history when no release specified', async () => {
    const { result, unmount } = renderHook(() => useHelmHistory())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history).toEqual([])
    unmount()
  })

  it('falls back to demo history when API unavailable', async () => {
    const { result, unmount } = renderHook(() => useHelmHistory('prod', 'prometheus', 'monitoring'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history.length).toBeGreaterThan(0)
    unmount()
  })
})

describe('useHelmValues', () => {
  it('returns expected shape', async () => {
    const { result, unmount } = renderHook(() => useHelmValues('cluster', 'my-release', 'default'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.values).toBe('object')
    expect(typeof result.current.refetch).toBe('function')
    unmount()
  })

  it('returns null values when no release specified', async () => {
    const { result, unmount } = renderHook(() => useHelmValues())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.values).toBeNull()
    unmount()
  })

  it('falls back to demo values when API unavailable', async () => {
    const { result, unmount } = renderHook(() => useHelmValues('prod', 'prometheus', 'monitoring'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.values).not.toBeNull()
    unmount()
  })
})
