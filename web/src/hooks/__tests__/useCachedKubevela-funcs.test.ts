/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedKubevela.ts.
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

import { __testables } from '../useCachedKubevela'
import type {
  KubeVelaApplication,
  KubeVelaControllerPod,
} from '../../components/cards/kubevela_status/demoData'

const {
  countApps,
  countPods,
  summarize,
  deriveHealth,
  buildStats,
  buildKubeVelaStatus,
  FAILED_STATUSES,
} = __testables

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeApp(overrides: Partial<KubeVelaApplication> = {}): KubeVelaApplication {
  return {
    name: 'app-1',
    namespace: 'default',
    cluster: 'cluster-1',
    status: 'running',
    componentCount: 2,
    traitCount: 1,
    workflowSteps: [],
    workflowStepsCompleted: 0,
    workflowStepsTotal: 0,
    traits: [],
    ageMinutes: 60,
    ...overrides,
  }
}

function makePod(overrides: Partial<KubeVelaControllerPod> = {}): KubeVelaControllerPod {
  return {
    name: 'vela-core-abc',
    namespace: 'vela-system',
    cluster: 'cluster-1',
    status: 'running',
    replicasReady: 1,
    replicasDesired: 1,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// FAILED_STATUSES
// ---------------------------------------------------------------------------

describe('FAILED_STATUSES', () => {
  it('includes workflowFailed and unhealthy', () => {
    expect(FAILED_STATUSES).toContain('workflowFailed')
    expect(FAILED_STATUSES).toContain('unhealthy')
  })

  it('does not include running or other statuses', () => {
    expect(FAILED_STATUSES).not.toContain('running')
    expect(FAILED_STATUSES).not.toContain('workflowSuspending')
    expect(FAILED_STATUSES).not.toContain('deleting')
  })
})

// ---------------------------------------------------------------------------
// countApps
// ---------------------------------------------------------------------------

describe('countApps', () => {
  it('returns 0 for empty array', () => {
    expect(countApps([], () => true)).toBe(0)
  })

  it('counts apps matching predicate', () => {
    const apps = [
      makeApp({ status: 'running' }),
      makeApp({ status: 'workflowFailed' }),
      makeApp({ status: 'running' }),
    ]
    expect(countApps(apps, a => a.status === 'running')).toBe(2)
  })

  it('returns 0 when no apps match', () => {
    const apps = [makeApp({ status: 'running' })]
    expect(countApps(apps, a => a.status === 'workflowFailed')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// countPods
// ---------------------------------------------------------------------------

describe('countPods', () => {
  it('returns 0 for empty array', () => {
    expect(countPods([], () => true)).toBe(0)
  })

  it('counts pods matching predicate', () => {
    const pods = [
      makePod({ status: 'running' }),
      makePod({ status: 'pending' }),
      makePod({ status: 'running' }),
    ]
    expect(countPods(pods, p => p.status === 'running')).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('returns zeroes for empty inputs', () => {
    const result = summarize([], [])
    expect(result).toEqual({
      totalApplications: 0,
      runningApplications: 0,
      failedApplications: 0,
      totalControllerPods: 0,
      runningControllerPods: 0,
    })
  })

  it('counts running and failed applications correctly', () => {
    const apps = [
      makeApp({ status: 'running' }),
      makeApp({ status: 'workflowFailed' }),
      makeApp({ status: 'unhealthy' }),
      makeApp({ status: 'workflowSuspending' }),
    ]
    const pods = [
      makePod({ status: 'running' }),
      makePod({ status: 'pending' }),
    ]
    const result = summarize(apps, pods)
    expect(result.totalApplications).toBe(4)
    expect(result.runningApplications).toBe(1)
    expect(result.failedApplications).toBe(2)
    expect(result.totalControllerPods).toBe(2)
    expect(result.runningControllerPods).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth', () => {
  it('returns not-installed when both arrays are empty', () => {
    expect(deriveHealth([], [])).toBe('not-installed')
  })

  it('returns healthy when all pods running and no failed apps', () => {
    const apps = [makeApp({ status: 'running' })]
    const pods = [makePod({ status: 'running', replicasReady: 1, replicasDesired: 1 })]
    expect(deriveHealth(apps, pods)).toBe('healthy')
  })

  it('returns degraded when a controller pod is not running', () => {
    const apps = [makeApp({ status: 'running' })]
    const pods = [makePod({ status: 'pending' })]
    expect(deriveHealth(apps, pods)).toBe('degraded')
  })

  it('returns degraded when a controller pod has insufficient ready replicas', () => {
    const apps = [makeApp({ status: 'running' })]
    const pods = [makePod({ status: 'running', replicasReady: 0, replicasDesired: 1 })]
    expect(deriveHealth(apps, pods)).toBe('degraded')
  })

  it('returns degraded when any app has a failed status', () => {
    const apps = [
      makeApp({ status: 'running' }),
      makeApp({ status: 'workflowFailed' }),
    ]
    const pods = [makePod({ status: 'running' })]
    expect(deriveHealth(apps, pods)).toBe('degraded')
  })

  it('returns degraded for unhealthy app status', () => {
    const apps = [makeApp({ status: 'unhealthy' })]
    const pods = [makePod({ status: 'running' })]
    expect(deriveHealth(apps, pods)).toBe('degraded')
  })

  it('returns healthy with apps but no pods', () => {
    const apps = [makeApp({ status: 'running' })]
    expect(deriveHealth(apps, [])).toBe('healthy')
  })

  it('returns healthy with pods but no apps', () => {
    const pods = [makePod({ status: 'running' })]
    expect(deriveHealth([], pods)).toBe('healthy')
  })
})

// ---------------------------------------------------------------------------
// buildStats
// ---------------------------------------------------------------------------

describe('buildStats', () => {
  it('returns zeroes for empty applications', () => {
    const result = buildStats([], 'v1.0.0')
    expect(result).toEqual({
      totalApplications: 0,
      runningApplications: 0,
      failedApplications: 0,
      totalComponents: 0,
      totalTraits: 0,
      controllerVersion: 'v1.0.0',
    })
  })

  it('aggregates component and trait counts', () => {
    const apps = [
      makeApp({ componentCount: 3, traitCount: 2, status: 'running' }),
      makeApp({ componentCount: 5, traitCount: 4, status: 'workflowFailed' }),
    ]
    const result = buildStats(apps, '1.9.11')
    expect(result.totalApplications).toBe(2)
    expect(result.runningApplications).toBe(1)
    expect(result.failedApplications).toBe(1)
    expect(result.totalComponents).toBe(8)
    expect(result.totalTraits).toBe(6)
    expect(result.controllerVersion).toBe('1.9.11')
  })
})

// ---------------------------------------------------------------------------
// buildKubeVelaStatus
// ---------------------------------------------------------------------------

describe('buildKubeVelaStatus', () => {
  it('builds a complete status object', () => {
    const apps = [makeApp({ status: 'running', componentCount: 2, traitCount: 1 })]
    const pods = [makePod({ status: 'running' })]
    const result = buildKubeVelaStatus(apps, pods, '1.9.11')

    expect(result.health).toBe('healthy')
    expect(result.applications).toHaveLength(1)
    expect(result.controllerPods).toHaveLength(1)
    expect(result.stats.controllerVersion).toBe('1.9.11')
    expect(result.stats.totalApplications).toBe(1)
    expect(result.stats.totalComponents).toBe(2)
    expect(result.stats.totalTraits).toBe(1)
    expect(result.summary.totalApplications).toBe(1)
    expect(result.summary.runningApplications).toBe(1)
    expect(result.summary.runningControllerPods).toBe(1)
    expect(result.lastCheckTime).toBeTruthy()
  })

  it('returns not-installed for empty inputs', () => {
    const result = buildKubeVelaStatus([], [], 'unknown')
    expect(result.health).toBe('not-installed')
    expect(result.applications).toEqual([])
    expect(result.controllerPods).toEqual([])
  })

  it('returns degraded when apps have failures', () => {
    const apps = [makeApp({ status: 'unhealthy' })]
    const pods = [makePod({ status: 'running' })]
    const result = buildKubeVelaStatus(apps, pods, '1.9.11')
    expect(result.health).toBe('degraded')
  })
})
