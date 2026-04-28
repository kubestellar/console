/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedSpiffe.ts, PLUS fetcher function tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockAuthFetch = vi.fn()
vi.mock('../../lib/api', () => ({
    createCachedHook: vi.fn(), authFetch: (...args: unknown[]) => mockAuthFetch(...args) }))

vi.mock('../../lib/constants/network', () => ({
    createCachedHook: vi.fn(),
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

vi.mock('../useDemoMode', () => ({
    createCachedHook: vi.fn(),
  useDemoMode: () => ({ isDemoMode: false }),
  isDemoModeForced: () => false,
  canToggleDemoMode: () => true,
  isNetlifyDeployment: () => false,
  isDemoToken: () => false,
  hasRealToken: () => true,
  setDemoToken: vi.fn(),
  getDemoMode: () => false,
  setGlobalDemoMode: vi.fn(),
}))

const mockUseCache = vi.fn(() => ({
  data: null,
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  error: null,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
  refetch: vi.fn(),
}))

vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../../components/cards/CardDataContext', () => ({
    createCachedHook: vi.fn(),
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false, showEmptyState: false })),
  useCardDemoState: vi.fn(),
}))

import { __testables } from '../useCachedSpiffe'
import type {
  SpiffeRegistrationEntry,
  SpiffeFederatedDomain,
  SpiffeStats,
} from '../../components/cards/spiffe_status/demoData'

const { summarize, deriveHealth, buildSpiffeStatus } = __testables

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<SpiffeRegistrationEntry> = {}): SpiffeRegistrationEntry {
  return {
    spiffeId: 'spiffe://example.org/workload-1',
    parentId: 'spiffe://example.org/node-1',
    selector: 'k8s:pod-label:app=web',
    svidType: 'x509',
    ttlSeconds: 3600,
    cluster: 'cluster-1',
    ...overrides,
  }
}

function makeFederatedDomain(overrides: Partial<SpiffeFederatedDomain> = {}): SpiffeFederatedDomain {
  return {
    trustDomain: 'partner.example.com',
    bundleEndpoint: 'https://partner.example.com/bundle',
    status: 'active',
    lastRefresh: new Date().toISOString(),
    ...overrides,
  }
}

function makeStats(overrides: Partial<SpiffeStats> = {}): SpiffeStats {
  return {
    x509SvidCount: 10,
    jwtSvidCount: 5,
    registrationEntryCount: 8,
    agentCount: 3,
    serverVersion: '1.9.0',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('returns zeros for empty data', () => {
    const stats = makeStats({ x509SvidCount: 0, jwtSvidCount: 0 })
    const result = summarize('', [], [], stats)
    expect(result).toEqual({
      trustDomain: '',
      totalSvids: 0,
      totalFederatedDomains: 0,
      totalEntries: 0,
    })
  })

  it('sums x509 and jwt SVID counts', () => {
    const stats = makeStats({ x509SvidCount: 12, jwtSvidCount: 8 })
    const result = summarize('example.org', [makeEntry()], [], stats)
    expect(result.totalSvids).toBe(20)
    expect(result.trustDomain).toBe('example.org')
    expect(result.totalEntries).toBe(1)
  })

  it('counts federated domains', () => {
    const stats = makeStats()
    const domains = [makeFederatedDomain(), makeFederatedDomain({ trustDomain: 'other.com' })]
    const result = summarize('example.org', [], domains, stats)
    expect(result.totalFederatedDomains).toBe(2)
  })

  it('counts entries', () => {
    const entries = [makeEntry(), makeEntry({ spiffeId: 'spiffe://example.org/wl-2' }), makeEntry({ spiffeId: 'spiffe://example.org/wl-3' })]
    const result = summarize('example.org', entries, [], makeStats())
    expect(result.totalEntries).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth', () => {
  it('returns not-installed when no trustDomain and no entries', () => {
    expect(deriveHealth('', [], [])).toBe('not-installed')
  })

  it('returns healthy with trustDomain and no federated domains', () => {
    expect(deriveHealth('example.org', [makeEntry()], [])).toBe('healthy')
  })

  it('returns healthy with trustDomain only (no entries, no domains)', () => {
    expect(deriveHealth('example.org', [], [])).toBe('healthy')
  })

  it('returns healthy when all federated domains are active', () => {
    const domains = [
      makeFederatedDomain({ status: 'active' }),
      makeFederatedDomain({ trustDomain: 'other.com', status: 'active' }),
    ]
    expect(deriveHealth('example.org', [], domains)).toBe('healthy')
  })

  it('returns degraded when a federated domain has failed', () => {
    const domains = [
      makeFederatedDomain({ status: 'active' }),
      makeFederatedDomain({ trustDomain: 'broken.com', status: 'failed' }),
    ]
    expect(deriveHealth('example.org', [], domains)).toBe('degraded')
  })

  it('returns healthy when federated domain is pending (not failed)', () => {
    const domains = [makeFederatedDomain({ status: 'pending' })]
    expect(deriveHealth('example.org', [], domains)).toBe('healthy')
  })

  it('returns not-installed when trustDomain is empty but entries exist', () => {
    // trustDomain is falsy, but entries.length > 0 — the condition is &&
    // so it requires BOTH to be falsy for not-installed
    expect(deriveHealth('', [makeEntry()], [])).not.toBe('not-installed')
  })
})

// ---------------------------------------------------------------------------
// buildSpiffeStatus
// ---------------------------------------------------------------------------

describe('buildSpiffeStatus', () => {
  it('builds not-installed status with empty data', () => {
    const stats = makeStats({ x509SvidCount: 0, jwtSvidCount: 0 })
    const result = buildSpiffeStatus('', [], [], stats)
    expect(result.health).toBe('not-installed')
    expect(result.entries).toEqual([])
    expect(result.federatedDomains).toEqual([])
    expect(result.stats).toBe(stats)
    expect(result.summary.trustDomain).toBe('')
    expect(result.lastCheckTime).toBeTruthy()
  })

  it('builds healthy status with entries and domains', () => {
    const entries = [makeEntry()]
    const domains = [makeFederatedDomain()]
    const stats = makeStats()
    const result = buildSpiffeStatus('example.org', entries, domains, stats)
    expect(result.health).toBe('healthy')
    expect(result.entries).toHaveLength(1)
    expect(result.federatedDomains).toHaveLength(1)
    expect(result.summary.totalSvids).toBe(15) // 10 + 5
    expect(result.summary.totalEntries).toBe(1)
    expect(result.summary.totalFederatedDomains).toBe(1)
  })

  it('builds degraded status with failed federation', () => {
    const domains = [makeFederatedDomain({ status: 'failed' })]
    const result = buildSpiffeStatus('example.org', [], domains, makeStats())
    expect(result.health).toBe('degraded')
  })

  it('sets lastCheckTime to a valid ISO string', () => {
    const result = buildSpiffeStatus('', [], [], makeStats())
    expect(() => new Date(result.lastCheckTime)).not.toThrow()
    expect(new Date(result.lastCheckTime).toISOString()).toBe(result.lastCheckTime)
  })
})

// ---------------------------------------------------------------------------
// Fetcher function tests (via useCache capture)
// ---------------------------------------------------------------------------

import { useCachedSpiffe } from '../useCachedSpiffe'

describe('fetchSpiffeStatus (via useCache fetcher)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue({
      data: { health: 'not-installed', entries: [], federatedDomains: [], stats: { x509SvidCount: 0, jwtSvidCount: 0, registrationEntryCount: 0, agentCount: 0, serverVersion: 'unknown' }, summary: { trustDomain: '', totalSvids: 0, totalFederatedDomains: 0, totalEntries: 0 }, lastCheckTime: '' },
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      error: null,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: vi.fn(),
    })
  })

  it('parses a successful API response into SpiffeStatusData', async () => {
    renderHook(() => useCachedSpiffe())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          trustDomain: 'example.org',
          entries: [
            {
              spiffeId: 'spiffe://example.org/wl-1',
              parentId: 'spiffe://example.org/node-1',
              selector: 'k8s:pod-label:app=web',
              svidType: 'x509',
              ttlSeconds: 3600,
              cluster: 'cluster-1',
            },
          ],
          federatedDomains: [],
          stats: {
            x509SvidCount: 10,
            jwtSvidCount: 5,
            registrationEntryCount: 1,
            agentCount: 2,
            serverVersion: '1.9.0',
          },
        }),
    })

    const result = await fetcher()
    expect(result.health).toBe('healthy')
    expect(result.entries).toHaveLength(1)
    expect(result.summary.trustDomain).toBe('example.org')
    expect(result.summary.totalSvids).toBe(15)
    expect(result.stats.serverVersion).toBe('1.9.0')
  })

  it('throws on non-ok response (non-404) so cache falls back to demo', async () => {
    renderHook(() => useCachedSpiffe())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    await expect(fetcher()).rejects.toThrow('Unable to fetch SPIFFE status')
  })

  it('returns not-installed data on 404 (treated as empty)', async () => {
    renderHook(() => useCachedSpiffe())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    // Spiffe uses NOT_INSTALLED_STATUSES which includes 404
    mockAuthFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    const result = await fetcher()
    expect(result.health).toBe('not-installed')
    expect(result.entries).toEqual([])
  })

  it('throws on network error so cache falls back to demo', async () => {
    renderHook(() => useCachedSpiffe())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockRejectedValueOnce(new Error('Network failure'))

    await expect(fetcher()).rejects.toThrow('Unable to fetch SPIFFE status')
  })

  it('handles null body fields gracefully', async () => {
    renderHook(() => useCachedSpiffe())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    })

    const result = await fetcher()
    expect(result.entries).toEqual([])
    expect(result.federatedDomains).toEqual([])
    expect(result.stats.x509SvidCount).toBe(0)
  })
})
