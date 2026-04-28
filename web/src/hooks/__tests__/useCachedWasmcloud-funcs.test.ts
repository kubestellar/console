/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedWasmcloud.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { mockAuthFetch, mockUseCache } = vi.hoisted(() => ({
  mockAuthFetch: vi.fn(),
  mockUseCache: vi.fn(),
}))
vi.mock('../../lib/api', () => ({
    createCachedHook: vi.fn(), authFetch: mockAuthFetch }))

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

mockUseCache.mockReturnValue({
  data: null,
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  error: null,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
  refetch: vi.fn(),
})
vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../../components/cards/CardDataContext', () => ({
    createCachedHook: vi.fn(),
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false, showEmptyState: false })),
  useCardDemoState: vi.fn(),
}))

import { __testables, useCachedWasmcloud } from '../useCachedWasmcloud'
import type {
  WasmcloudHost,
  WasmcloudActor,
  WasmcloudProvider,
  WasmcloudLink,
  WasmcloudStats,
} from '../../components/cards/wasmcloud_status/demoData'

const { summarize, deriveHealth, buildWasmcloudStatus } = __testables

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeHost(overrides: Partial<WasmcloudHost> = {}): WasmcloudHost {
  return {
    hostId: 'host-1',
    friendlyName: 'Host 1',
    status: 'ready',
    labels: {},
    uptimeSeconds: 3600,
    actorCount: 2,
    providerCount: 1,
    cluster: 'cluster-1',
    ...overrides,
  }
}

function makeActor(overrides: Partial<WasmcloudActor> = {}): WasmcloudActor {
  return {
    actorId: 'actor-1',
    name: 'echo',
    imageRef: 'ghcr.io/wasmcloud/echo:0.3.8',
    instanceCount: 1,
    hostId: 'host-1',
    cluster: 'cluster-1',
    ...overrides,
  }
}

function makeProvider(overrides: Partial<WasmcloudProvider> = {}): WasmcloudProvider {
  return {
    providerId: 'prov-1',
    name: 'httpserver',
    contractId: 'wasmcloud:httpserver',
    linkName: 'default',
    imageRef: 'ghcr.io/wasmcloud/httpserver:0.19.1',
    status: 'running',
    hostId: 'host-1',
    cluster: 'cluster-1',
    ...overrides,
  }
}

function makeLink(overrides: Partial<WasmcloudLink> = {}): WasmcloudLink {
  return {
    actorId: 'actor-1',
    providerId: 'prov-1',
    contractId: 'wasmcloud:httpserver',
    linkName: 'default',
    status: 'active',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('returns zeros for empty arrays', () => {
    const result = summarize('', [], [], [], [])
    expect(result).toEqual({
      latticeId: '',
      totalHosts: 0,
      totalActors: 0,
      totalProviders: 0,
      totalLinks: 0,
    })
  })

  it('counts all resource types', () => {
    const result = summarize(
      'lattice-abc',
      [makeHost(), makeHost({ hostId: 'host-2' })],
      [makeActor()],
      [makeProvider(), makeProvider({ providerId: 'prov-2' }), makeProvider({ providerId: 'prov-3' })],
      [makeLink()],
    )
    expect(result.latticeId).toBe('lattice-abc')
    expect(result.totalHosts).toBe(2)
    expect(result.totalActors).toBe(1)
    expect(result.totalProviders).toBe(3)
    expect(result.totalLinks).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth', () => {
  it('returns not-installed when no latticeId and no hosts', () => {
    expect(deriveHealth('', [], [], [])).toBe('not-installed')
  })

  it('returns healthy when latticeId present with ready hosts', () => {
    expect(deriveHealth('lattice-1', [makeHost()], [makeProvider()], [makeLink()])).toBe('healthy')
  })

  it('returns healthy with only latticeId (no hosts)', () => {
    // latticeId is truthy, so not "not-installed"
    expect(deriveHealth('lattice-1', [], [], [])).toBe('healthy')
  })

  it('returns degraded when a host is unreachable', () => {
    const hosts = [makeHost(), makeHost({ hostId: 'host-2', status: 'unreachable' })]
    expect(deriveHealth('lattice-1', hosts, [], [])).toBe('degraded')
  })

  it('returns degraded when a provider has failed', () => {
    const providers = [makeProvider({ status: 'failed' })]
    expect(deriveHealth('lattice-1', [makeHost()], providers, [])).toBe('degraded')
  })

  it('returns degraded when a link has failed', () => {
    const links = [makeLink({ status: 'failed' })]
    expect(deriveHealth('lattice-1', [makeHost()], [], links)).toBe('degraded')
  })

  it('returns healthy when providers are running and links are active', () => {
    expect(
      deriveHealth(
        'lattice-1',
        [makeHost()],
        [makeProvider({ status: 'running' })],
        [makeLink({ status: 'active' })],
      ),
    ).toBe('healthy')
  })

  it('returns healthy when host is starting (not unreachable)', () => {
    expect(
      deriveHealth('lattice-1', [makeHost({ status: 'starting' })], [], []),
    ).toBe('healthy')
  })

  it('returns healthy when provider is starting (not failed)', () => {
    expect(
      deriveHealth('lattice-1', [], [makeProvider({ status: 'starting' })], []),
    ).toBe('healthy')
  })

  it('returns healthy when link is pending (not failed)', () => {
    expect(
      deriveHealth('lattice-1', [], [], [makeLink({ status: 'pending' })]),
    ).toBe('healthy')
  })
})

// ---------------------------------------------------------------------------
// buildWasmcloudStatus
// ---------------------------------------------------------------------------

describe('buildWasmcloudStatus', () => {
  const baseStats: WasmcloudStats = {
    hostCount: 1,
    actorCount: 2,
    providerCount: 1,
    linkCount: 1,
    latticeVersion: '0.82.0',
  }

  it('builds a not-installed status with empty inputs', () => {
    const result = buildWasmcloudStatus('', [], [], [], [], baseStats)
    expect(result.health).toBe('not-installed')
    expect(result.hosts).toEqual([])
    expect(result.actors).toEqual([])
    expect(result.providers).toEqual([])
    expect(result.links).toEqual([])
    expect(result.stats).toBe(baseStats)
    expect(result.summary.totalHosts).toBe(0)
    expect(result.lastCheckTime).toBeTruthy()
  })

  it('builds a healthy status with populated data', () => {
    const hosts = [makeHost()]
    const actors = [makeActor()]
    const providers = [makeProvider()]
    const links = [makeLink()]
    const result = buildWasmcloudStatus('lattice-abc', hosts, actors, providers, links, baseStats)
    expect(result.health).toBe('healthy')
    expect(result.hosts).toHaveLength(1)
    expect(result.actors).toHaveLength(1)
    expect(result.providers).toHaveLength(1)
    expect(result.links).toHaveLength(1)
    expect(result.summary.latticeId).toBe('lattice-abc')
    expect(result.summary.totalHosts).toBe(1)
  })

  it('builds a degraded status with failed provider', () => {
    const result = buildWasmcloudStatus(
      'lattice-1',
      [makeHost()],
      [],
      [makeProvider({ status: 'failed' })],
      [],
      baseStats,
    )
    expect(result.health).toBe('degraded')
  })

  it('sets lastCheckTime to a valid ISO string', () => {
    const result = buildWasmcloudStatus('', [], [], [], [], baseStats)
    expect(() => new Date(result.lastCheckTime)).not.toThrow()
    expect(new Date(result.lastCheckTime).toISOString()).toBe(result.lastCheckTime)
  })
})

// ---------------------------------------------------------------------------
// fetcher (via useCache capture)
// ---------------------------------------------------------------------------

describe('fetcher (via useCache capture)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue({
      data: {
        health: 'not-installed',
        hosts: [],
        actors: [],
        providers: [],
        links: [],
        stats: { hostCount: 0, actorCount: 0, providerCount: 0, linkCount: 0, latticeVersion: 'unknown' },
        summary: { latticeId: '', totalHosts: 0, totalActors: 0, totalProviders: 0, totalLinks: 0 },
        lastCheckTime: new Date().toISOString(),
      },
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

  it('returns parsed wasmCloud status on successful response', async () => {
    const validResponse = {
      latticeId: 'lattice-abc',
      hosts: [{ hostId: 'host-1', friendlyName: 'Host 1', status: 'ready', labels: {}, uptimeSeconds: 3600, actorCount: 2, providerCount: 1, cluster: 'c1' }],
      actors: [{ actorId: 'actor-1', name: 'echo', imageRef: 'ghcr.io/wasmcloud/echo:0.3.8', instanceCount: 1, hostId: 'host-1', cluster: 'c1' }],
      providers: [{ providerId: 'prov-1', name: 'httpserver', contractId: 'wasmcloud:httpserver', linkName: 'default', imageRef: 'ghcr.io/wasmcloud/httpserver:0.19.1', status: 'running', hostId: 'host-1', cluster: 'c1' }],
      links: [{ actorId: 'actor-1', providerId: 'prov-1', contractId: 'wasmcloud:httpserver', linkName: 'default', status: 'active' }],
      stats: { hostCount: 1, actorCount: 1, providerCount: 1, linkCount: 1, latticeVersion: '0.82.0' },
    }

    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validResponse),
    })

    renderHook(() => useCachedWasmcloud())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    expect(result.health).toBe('healthy')
    expect(result.hosts).toHaveLength(1)
    expect(result.actors).toHaveLength(1)
    expect(result.providers).toHaveLength(1)
    expect(result.links).toHaveLength(1)
  })

  it('returns not-installed status on 404 (treat404AsEmpty path)', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 404,
    })

    renderHook(() => useCachedWasmcloud())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    expect(result.health).toBe('not-installed')
  })

  it('throws when authFetch returns a non-404 error', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 500,
    })

    renderHook(() => useCachedWasmcloud())
    const config = mockUseCache.mock.calls[0][0]

    await expect(config.fetcher()).rejects.toThrow('Unable to fetch wasmCloud status')
  })

  it('throws when authFetch rejects (network error)', async () => {
    mockAuthFetch.mockRejectedValue(new Error('Network failure'))

    renderHook(() => useCachedWasmcloud())
    const config = mockUseCache.mock.calls[0][0]

    await expect(config.fetcher()).rejects.toThrow('Unable to fetch wasmCloud status')
  })
})
