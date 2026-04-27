/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedWasmcloud.ts.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

vi.mock('../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
  isDemoModeForced: false,
}))

vi.mock('../../lib/cache', () => ({
  useCache: vi.fn(() => ({
    data: null,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
  })),
}))

import { __testables } from '../useCachedWasmcloud'
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
