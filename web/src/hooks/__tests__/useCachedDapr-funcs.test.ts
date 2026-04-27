/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedDapr.ts.
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

import { __testables } from '../useCachedDapr'
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
