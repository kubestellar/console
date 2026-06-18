import { describe, it, expect } from 'vitest'
import {
  pct,
  parseTimestamp,
  generateId,
  detectEventCorrelations,
  detectClusterDeltas,
  detectCascadeImpact,
  detectConfigDrift,
  detectResourceImbalance,
  detectRestartCorrelation,
  trackRolloutProgress,
  EVENT_CORRELATION_WINDOW_MS,
  CASCADE_DETECTION_WINDOW_MS,
  RESTART_CORRELATION_THRESHOLD,
  CPU_CRITICAL_THRESHOLD_PCT,
  RESTART_CRITICAL_THRESHOLD,
  INFRA_CRITICAL_WORKLOADS,
  MAX_INSIGHTS_PER_CATEGORY,
  MIN_CORRELATED_CLUSTERS,
} from './useMultiClusterInsights'
import type { ClusterEvent, Deployment, PodIssue } from './mcp/types'
import type { ClusterInfo } from './mcp/types'

/** Fixed timestamp used in test factories for determinism */
const FIXED_TIMESTAMP = '2026-01-15T10:00:00.000Z'

// ── Helper factory functions ──────────────────────────────────────────

function makeEvent(overrides: Partial<ClusterEvent> = {}): ClusterEvent {
  return {
    type: 'Warning',
    reason: 'BackOff',
    message: 'Back-off restarting failed container',
    object: 'pod/test-pod',
    namespace: 'default',
    cluster: 'cluster-1',
    count: 1,
    lastSeen: FIXED_TIMESTAMP,
    ...overrides,
  }
}

function makeDeployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    name: 'api-server',
    namespace: 'default',
    cluster: 'cluster-1',
    status: 'running',
    replicas: 3,
    readyReplicas: 3,
    updatedReplicas: 3,
    availableReplicas: 3,
    progress: 100,
    image: 'api-server:v1.0.0',
    ...overrides,
  }
}

function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    name: 'cluster-1',
    context: 'cluster-1-ctx',
    healthy: true,
    cpuCores: 8,
    memoryGB: 32,
    ...overrides,
  }
}

function makePodIssue(overrides: Partial<PodIssue> = {}): PodIssue {
  return {
    name: 'api-server-abc123-xyz',
    namespace: 'default',
    cluster: 'cluster-1',
    status: 'CrashLoopBackOff',
    issues: ['CrashLoopBackOff'],
    restarts: 5,
    ...overrides,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────


describe('detectConfigDrift', () => {
  it('returns empty for no deployments', () => {
    expect(detectConfigDrift([])).toEqual([])
  })

  it('handles undefined input gracefully', () => {
    expect(detectConfigDrift(undefined as unknown as Deployment[])).toEqual([])
  })

  it('returns empty for single-cluster deployments', () => {
    const deps = [makeDeployment({ cluster: 'cluster-1' })]
    expect(detectConfigDrift(deps)).toEqual([])
  })

  it('returns empty when all deployments have same image and replicas', () => {
    const deps = [
      makeDeployment({ cluster: 'cluster-1' }),
      makeDeployment({ cluster: 'cluster-2' }),
    ]
    expect(detectConfigDrift(deps)).toEqual([])
  })

  it('detects drift when images differ across clusters', () => {
    const deps = [
      makeDeployment({ cluster: 'cluster-1', image: 'api:v1.0' }),
      makeDeployment({ cluster: 'cluster-2', image: 'api:v2.0' }),
    ]
    const result = detectConfigDrift(deps)
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('config-drift')
    expect(result[0].severity).toBe('warning')
    expect(result[0].description).toContain('2 different images')
  })

  it('detects drift when replica counts differ', () => {
    const deps = [
      makeDeployment({ cluster: 'cluster-1', replicas: 3, image: 'api:v1.0' }),
      makeDeployment({ cluster: 'cluster-2', replicas: 5, image: 'api:v1.0' }),
    ]
    const result = detectConfigDrift(deps)
    expect(result).toHaveLength(1)
    expect(result[0].severity).toBe('info') // only replicas differ, not images
    expect(result[0].description).toContain('2 different replica counts')
  })
})

// ── Algorithm 5: Resource Imbalance ───────────────────────────────────


describe('detectConfigDrift — regression', () => {
  it('reports both image and replica drift in the description', () => {
    const deps = [
      makeDeployment({ cluster: 'cluster-1', image: 'api:v1', replicas: 3 }),
      makeDeployment({ cluster: 'cluster-2', image: 'api:v2', replicas: 5 }),
    ]
    const result = detectConfigDrift(deps)
    expect(result).toHaveLength(1)
    expect(result[0].description).toContain('2 different images')
    expect(result[0].description).toContain('2 different replica counts')
    // Image drift present => severity is warning
    expect(result[0].severity).toBe('warning')
  })

  it('filters clusters without a cluster field from affectedClusters', () => {
    const deps = [
      makeDeployment({ cluster: 'cluster-1', image: 'api:v1' }),
      makeDeployment({ cluster: undefined, image: 'api:v2' }),
      makeDeployment({ cluster: 'cluster-2', image: 'api:v3' }),
    ]
    const result = detectConfigDrift(deps)
    expect(result).toHaveLength(1)
    // undefined cluster should be filtered out
    expect(result[0].affectedClusters).not.toContain(undefined)
    expect(result[0].affectedClusters).toEqual(
      expect.arrayContaining(['cluster-1', 'cluster-2']),
    )
  })
})

// ── Resource Imbalance: deeper coverage ──────────────────────────────

