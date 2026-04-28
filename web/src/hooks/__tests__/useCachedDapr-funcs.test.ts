/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedDapr.ts.
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

import { __testables, useCachedDapr } from '../useCachedDapr'
import type {
  DaprControlPlanePod,
  DaprComponent,
  DaprAppSidecar,
} from '../../components/cards/dapr_status/demoData'

const {
  summarize,
  deriveHealth,
  buildDaprStatus,
  buildBuildingBlocks,
  countByType,
} = __testables

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makePod(overrides: Partial<DaprControlPlanePod> = {}): DaprControlPlanePod {
  return {
    name: 'operator',
    namespace: 'dapr-system',
    status: 'running',
    replicasDesired: 1,
    replicasReady: 1,
    cluster: 'default',
    ...overrides,
  }
}

function makeComponent(overrides: Partial<DaprComponent> = {}): DaprComponent {
  return {
    name: 'my-statestore',
    namespace: 'default',
    type: 'state-store',
    componentImpl: 'state.redis',
    cluster: 'default',
    ...overrides,
  }
}

const EMPTY_APPS: DaprAppSidecar = { total: 0, namespaces: 0 }

// ---------------------------------------------------------------------------
// countByType
// ---------------------------------------------------------------------------

describe('countByType', () => {
  it('returns 0 for empty array', () => {
    expect(countByType([], 'state-store')).toBe(0)
  })

  it('counts components of the given type', () => {
    const components = [
      makeComponent({ type: 'state-store' }),
      makeComponent({ type: 'pubsub' }),
      makeComponent({ type: 'state-store' }),
      makeComponent({ type: 'binding' }),
    ]
    expect(countByType(components, 'state-store')).toBe(2)
    expect(countByType(components, 'pubsub')).toBe(1)
    expect(countByType(components, 'binding')).toBe(1)
  })

  it('returns 0 when no components match', () => {
    const components = [makeComponent({ type: 'pubsub' })]
    expect(countByType(components, 'binding')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// buildBuildingBlocks
// ---------------------------------------------------------------------------

describe('buildBuildingBlocks', () => {
  it('returns zeroes for empty components', () => {
    const result = buildBuildingBlocks([])
    expect(result).toEqual({ stateStores: 0, pubsubs: 0, bindings: 0 })
  })

  it('counts each type correctly', () => {
    const components = [
      makeComponent({ type: 'state-store' }),
      makeComponent({ type: 'state-store' }),
      makeComponent({ type: 'pubsub' }),
      makeComponent({ type: 'binding' }),
      makeComponent({ type: 'binding' }),
      makeComponent({ type: 'binding' }),
    ]
    const result = buildBuildingBlocks(components)
    expect(result.stateStores).toBe(2)
    expect(result.pubsubs).toBe(1)
    expect(result.bindings).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('returns zeroes for empty inputs', () => {
    const result = summarize([], [], EMPTY_APPS)
    expect(result).toEqual({
      totalControlPlanePods: 0,
      runningControlPlanePods: 0,
      totalComponents: 0,
      totalDaprApps: 0,
    })
  })

  it('counts running pods and total components', () => {
    const pods = [
      makePod({ status: 'running' }),
      makePod({ status: 'pending' }),
      makePod({ status: 'running' }),
    ]
    const components = [
      makeComponent(),
      makeComponent(),
    ]
    const apps: DaprAppSidecar = { total: 10, namespaces: 3 }
    const result = summarize(pods, components, apps)
    expect(result.totalControlPlanePods).toBe(3)
    expect(result.runningControlPlanePods).toBe(2)
    expect(result.totalComponents).toBe(2)
    expect(result.totalDaprApps).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth', () => {
  it('returns not-installed when everything is empty', () => {
    expect(deriveHealth([], [], EMPTY_APPS)).toBe('not-installed')
  })

  it('returns healthy when all pods are running with full replicas', () => {
    const pods = [makePod({ status: 'running', replicasReady: 1, replicasDesired: 1 })]
    const components = [makeComponent()]
    const apps: DaprAppSidecar = { total: 5, namespaces: 2 }
    expect(deriveHealth(pods, components, apps)).toBe('healthy')
  })

  it('returns degraded when a pod is not running', () => {
    const pods = [makePod({ status: 'pending' })]
    expect(deriveHealth(pods, [], EMPTY_APPS)).toBe('degraded')
  })

  it('returns degraded when a pod has insufficient ready replicas', () => {
    const pods = [makePod({ status: 'running', replicasReady: 1, replicasDesired: 3 })]
    expect(deriveHealth(pods, [], EMPTY_APPS)).toBe('degraded')
  })

  it('returns healthy with only components (no pods)', () => {
    expect(deriveHealth([], [makeComponent()], EMPTY_APPS)).toBe('healthy')
  })

  it('returns healthy with only apps (no pods or components)', () => {
    expect(deriveHealth([], [], { total: 5, namespaces: 1 })).toBe('healthy')
  })

  it('returns degraded when pod status is failed', () => {
    const pods = [makePod({ status: 'failed' })]
    expect(deriveHealth(pods, [], EMPTY_APPS)).toBe('degraded')
  })
})

// ---------------------------------------------------------------------------
// buildDaprStatus
// ---------------------------------------------------------------------------

describe('buildDaprStatus', () => {
  it('builds a complete status object', () => {
    const pods = [makePod({ status: 'running' })]
    const components = [
      makeComponent({ type: 'state-store' }),
      makeComponent({ type: 'pubsub' }),
    ]
    const apps: DaprAppSidecar = { total: 10, namespaces: 3 }
    const result = buildDaprStatus(pods, components, apps)

    expect(result.health).toBe('healthy')
    expect(result.controlPlane).toHaveLength(1)
    expect(result.components).toHaveLength(2)
    expect(result.apps).toEqual(apps)
    expect(result.buildingBlocks.stateStores).toBe(1)
    expect(result.buildingBlocks.pubsubs).toBe(1)
    expect(result.buildingBlocks.bindings).toBe(0)
    expect(result.summary.totalControlPlanePods).toBe(1)
    expect(result.summary.runningControlPlanePods).toBe(1)
    expect(result.summary.totalComponents).toBe(2)
    expect(result.summary.totalDaprApps).toBe(10)
    expect(result.lastCheckTime).toBeTruthy()
  })

  it('returns not-installed for empty inputs', () => {
    const result = buildDaprStatus([], [], EMPTY_APPS)
    expect(result.health).toBe('not-installed')
    expect(result.controlPlane).toEqual([])
    expect(result.components).toEqual([])
  })

  it('returns degraded when a control plane pod is pending', () => {
    const pods = [
      makePod({ status: 'running' }),
      makePod({ status: 'pending', name: 'sentry' }),
    ]
    const result = buildDaprStatus(pods, [], EMPTY_APPS)
    expect(result.health).toBe('degraded')
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
        controlPlane: [],
        components: [],
        apps: { total: 0, namespaces: 0 },
        buildingBlocks: { stateStores: 0, pubsubs: 0, bindings: 0 },
        summary: { totalControlPlanePods: 0, runningControlPlanePods: 0, totalComponents: 0, totalDaprApps: 0 },
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

  it('returns parsed Dapr status on successful response', async () => {
    const validResponse = {
      controlPlane: [
        { name: 'operator', namespace: 'dapr-system', status: 'running', replicasDesired: 1, replicasReady: 1, cluster: 'default' },
      ],
      components: [
        { name: 'statestore', namespace: 'default', type: 'state-store', componentImpl: 'state.redis', cluster: 'default' },
      ],
      apps: { total: 5, namespaces: 2 },
    }

    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validResponse),
    })

    renderHook(() => useCachedDapr())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    expect(result.health).toBe('healthy')
    expect(result.controlPlane).toHaveLength(1)
    expect(result.components).toHaveLength(1)
    expect(result.apps.total).toBe(5)
  })

  it('returns not-installed status on 404 response', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 404,
    })

    renderHook(() => useCachedDapr())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    // Dapr uses NOT_INSTALLED_STATUSES which includes 404 — returns
    // { data: null, failed: false }, so the fetcher builds empty status
    expect(result.health).toBe('not-installed')
  })

  it('throws when authFetch returns a non-listed error status', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 500,
    })

    renderHook(() => useCachedDapr())
    const config = mockUseCache.mock.calls[0][0]

    await expect(config.fetcher()).rejects.toThrow('Unable to fetch Dapr status')
  })

  it('throws when authFetch rejects (network error)', async () => {
    mockAuthFetch.mockRejectedValue(new Error('Network failure'))

    renderHook(() => useCachedDapr())
    const config = mockUseCache.mock.calls[0][0]

    await expect(config.fetcher()).rejects.toThrow('Unable to fetch Dapr status')
  })
})
