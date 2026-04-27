/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedCortex.ts.
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

import { __testables } from '../useCachedCortex'
import type {
  CortexComponentPod,
  CortexIngestionMetrics,
} from '../../lib/demo/cortex'

const { summarize, deriveHealth, buildCortexStatus } = __testables

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('returns zeroes for an empty array', () => {
    const result = summarize([])
    expect(result).toEqual({
      totalPods: 0,
      runningPods: 0,
      totalComponents: 0,
      runningComponents: 0,
    })
  })

  it('sums replica counts across components', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ replicasDesired: 3, replicasReady: 3, status: 'running' }),
      makeComponent({ replicasDesired: 6, replicasReady: 5, status: 'running' }),
    ]
    const result = summarize(components)
    expect(result.totalPods).toBe(9)
    expect(result.runningPods).toBe(8)
  })

  it('counts components where status is running AND all replicas ready', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'running', replicasDesired: 3, replicasReady: 3 }),
      makeComponent({ status: 'running', replicasDesired: 6, replicasReady: 5 }),
      makeComponent({ status: 'pending', replicasDesired: 2, replicasReady: 2 }),
    ]
    const result = summarize(components)
    expect(result.totalComponents).toBe(3)
    // Only the first one is fully running (status=running AND ready===desired)
    expect(result.runningComponents).toBe(1)
  })

  it('counts single fully-running component', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'running', replicasDesired: 2, replicasReady: 2 }),
    ]
    const result = summarize(components)
    expect(result.totalComponents).toBe(1)
    expect(result.runningComponents).toBe(1)
  })

  it('returns 0 runningComponents when all are degraded', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'pending', replicasDesired: 3, replicasReady: 0 }),
      makeComponent({ status: 'failed', replicasDesired: 2, replicasReady: 0 }),
    ]
    const result = summarize(components)
    expect(result.runningComponents).toBe(0)
    expect(result.totalComponents).toBe(2)
    expect(result.totalPods).toBe(5)
    expect(result.runningPods).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth', () => {
  it('returns not-installed for an empty array', () => {
    expect(deriveHealth([])).toBe('not-installed')
  })

  it('returns healthy when all components are running with full replicas', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'running', replicasDesired: 3, replicasReady: 3 }),
      makeComponent({ status: 'running', replicasDesired: 2, replicasReady: 2 }),
    ]
    expect(deriveHealth(components)).toBe('healthy')
  })

  it('returns degraded when a component is not running', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'running', replicasDesired: 3, replicasReady: 3 }),
      makeComponent({ status: 'pending', replicasDesired: 2, replicasReady: 2 }),
    ]
    expect(deriveHealth(components)).toBe('degraded')
  })

  it('returns degraded when replicas are not fully ready', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'running', replicasDesired: 3, replicasReady: 2 }),
    ]
    expect(deriveHealth(components)).toBe('degraded')
  })

  it('returns degraded for failed status', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'failed', replicasDesired: 1, replicasReady: 0 }),
    ]
    expect(deriveHealth(components)).toBe('degraded')
  })

  it('returns degraded for unknown status', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'unknown', replicasDesired: 1, replicasReady: 1 }),
    ]
    expect(deriveHealth(components)).toBe('degraded')
  })

  it('returns healthy for a single fully healthy component', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'running', replicasDesired: 1, replicasReady: 1 }),
    ]
    expect(deriveHealth(components)).toBe('healthy')
  })
})

// ---------------------------------------------------------------------------
// buildCortexStatus
// ---------------------------------------------------------------------------

describe('buildCortexStatus', () => {
  const DEFAULT_METRICS: CortexIngestionMetrics = {
    activeSeries: 0,
    ingestionRatePerSec: 0,
    queryRatePerSec: 0,
    tenantCount: 0,
  }

  it('builds a complete status object', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'running', replicasDesired: 3, replicasReady: 3 }),
    ]
    const metrics: CortexIngestionMetrics = {
      activeSeries: 500_000,
      ingestionRatePerSec: 12_000,
      queryRatePerSec: 50,
      tenantCount: 4,
    }
    const result = buildCortexStatus(components, metrics, '1.16.0')

    expect(result.health).toBe('healthy')
    expect(result.version).toBe('1.16.0')
    expect(result.components).toBe(components)
    expect(result.metrics).toBe(metrics)
    expect(result.summary.totalComponents).toBe(1)
    expect(result.summary.runningComponents).toBe(1)
    expect(result.lastCheckTime).toBeDefined()
  })

  it('returns not-installed for empty components', () => {
    const result = buildCortexStatus([], DEFAULT_METRICS, 'unknown')
    expect(result.health).toBe('not-installed')
  })

  it('returns degraded when a component is degraded', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'running', replicasDesired: 3, replicasReady: 2 }),
    ]
    const result = buildCortexStatus(components, DEFAULT_METRICS, '1.16.0')
    expect(result.health).toBe('degraded')
  })

  it('computes summary from components', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'running', replicasDesired: 3, replicasReady: 3 }),
      makeComponent({ status: 'running', replicasDesired: 6, replicasReady: 5 }),
    ]
    const result = buildCortexStatus(components, DEFAULT_METRICS, '1.16.0')
    expect(result.summary.totalPods).toBe(9)
    expect(result.summary.runningPods).toBe(8)
    expect(result.summary.totalComponents).toBe(2)
    expect(result.summary.runningComponents).toBe(1)
  })

  it('sets lastCheckTime to a valid ISO string', () => {
    const result = buildCortexStatus([], DEFAULT_METRICS, 'unknown')
    expect(() => new Date(result.lastCheckTime)).not.toThrow()
    expect(new Date(result.lastCheckTime).toISOString()).toBe(result.lastCheckTime)
  })
})

// ---------------------------------------------------------------------------
// Helpers — factory functions for test data
// ---------------------------------------------------------------------------

function makeComponent(overrides?: Partial<CortexComponentPod>): CortexComponentPod {
  return {
    name: 'distributor',
    namespace: 'cortex',
    status: 'running',
    replicasDesired: 3,
    replicasReady: 3,
    cluster: 'default',
    ...overrides,
  }
}
