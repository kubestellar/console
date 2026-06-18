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


describe('detectClusterDeltas', () => {
  it('returns empty for no deployments', () => {
    expect(detectClusterDeltas([], [])).toEqual([])
  })

  it('handles undefined input gracefully', () => {
    expect(
      detectClusterDeltas(
        undefined as unknown as Deployment[],
        undefined as unknown as ClusterInfo[],
      ),
    ).toEqual([])
  })

  it('returns empty for single cluster deployment', () => {
    const deps = [makeDeployment({ cluster: 'cluster-1' })]
    const clusters = [makeCluster({ name: 'cluster-1' })]
    expect(detectClusterDeltas(deps, clusters)).toEqual([])
  })

  it('detects image version deltas across clusters', () => {
    const deps = [
      makeDeployment({ cluster: 'cluster-1', image: 'api:v1.0' }),
      makeDeployment({ cluster: 'cluster-2', image: 'api:v2.0' }),
    ]
    const clusters = [
      makeCluster({ name: 'cluster-1' }),
      makeCluster({ name: 'cluster-2' }),
    ]
    const result = detectClusterDeltas(deps, clusters)
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('cluster-delta')
    expect(result[0].deltas).toBeDefined()
    expect(result[0].deltas!.some((d) => d.dimension === 'Image Version')).toBe(
      true,
    )
  })

  it('detects replica count deltas', () => {
    const deps = [
      makeDeployment({ cluster: 'cluster-1', replicas: 3, image: 'api:v1.0' }),
      makeDeployment({ cluster: 'cluster-2', replicas: 10, image: 'api:v1.0' }),
    ]
    const clusters = [
      makeCluster({ name: 'cluster-1' }),
      makeCluster({ name: 'cluster-2' }),
    ]
    const result = detectClusterDeltas(deps, clusters)
    expect(result).toHaveLength(1)
    const replicaDelta = result[0].deltas!.find(
      (d) => d.dimension === 'Replica Count',
    )
    expect(replicaDelta).toBeDefined()
    expect(replicaDelta!.significance).toBe('high') // 70% diff
  })

  it('detects status deltas', () => {
    const deps = [
      makeDeployment({
        cluster: 'cluster-1',
        status: 'running',
        image: 'api:v1.0',
      }),
      makeDeployment({
        cluster: 'cluster-2',
        status: 'failed',
        image: 'api:v1.0',
      }),
    ]
    const clusters = [
      makeCluster({ name: 'cluster-1' }),
      makeCluster({ name: 'cluster-2' }),
    ]
    const result = detectClusterDeltas(deps, clusters)
    expect(result).toHaveLength(1)
    const statusDelta = result[0].deltas!.find((d) => d.dimension === 'Status')
    expect(statusDelta).toBeDefined()
    expect(statusDelta!.significance).toBe('high') // failed = high
  })

  it('returns no deltas when deployments are identical', () => {
    const deps = [
      makeDeployment({ cluster: 'cluster-1' }),
      makeDeployment({ cluster: 'cluster-2' }),
    ]
    const clusters = [
      makeCluster({ name: 'cluster-1' }),
      makeCluster({ name: 'cluster-2' }),
    ]
    expect(detectClusterDeltas(deps, clusters)).toEqual([])
  })
})

// ── Algorithm 3: Cascade Impact ───────────────────────────────────────


describe('detectClusterDeltas — regression', () => {
  it('detects multiple delta dimensions simultaneously', () => {
    const deps = [
      makeDeployment({
        cluster: 'cluster-1',
        image: 'api:v1.0',
        replicas: 3,
        status: 'running',
      }),
      makeDeployment({
        cluster: 'cluster-2',
        image: 'api:v2.0',
        replicas: 10,
        status: 'failed',
      }),
    ]
    const clusters = [
      makeCluster({ name: 'cluster-1' }),
      makeCluster({ name: 'cluster-2' }),
    ]
    const result = detectClusterDeltas(deps, clusters)
    expect(result).toHaveLength(1)
    const dimensions = result[0].deltas!.map((d) => d.dimension).sort()
    expect(dimensions).toEqual(['Image Version', 'Replica Count', 'Status'])
    // severity should be 'warning' because there are high-significance deltas
    expect(result[0].severity).toBe('warning')
  })

  it('classifies replica delta significance as medium for 20-49% difference', () => {
    // 3 vs 5 replicas: diff=2, max=5, pctDiff=40% which is >= 20% but < 50%
    const deps = [
      makeDeployment({ cluster: 'cluster-1', replicas: 3, image: 'api:v1.0' }),
      makeDeployment({ cluster: 'cluster-2', replicas: 5, image: 'api:v1.0' }),
    ]
    const clusters = [
      makeCluster({ name: 'cluster-1' }),
      makeCluster({ name: 'cluster-2' }),
    ]
    const result = detectClusterDeltas(deps, clusters)
    expect(result).toHaveLength(1)
    const replicaDelta = result[0].deltas!.find(
      (d) => d.dimension === 'Replica Count',
    )
    expect(replicaDelta!.significance).toBe('medium')
  })

  it('classifies replica delta significance as low for < 20% difference', () => {
    // 9 vs 10 replicas: diff=1, max=10, pctDiff=10% which is < 20%
    const deps = [
      makeDeployment({ cluster: 'cluster-1', replicas: 9, image: 'api:v1.0' }),
      makeDeployment({ cluster: 'cluster-2', replicas: 10, image: 'api:v1.0' }),
    ]
    const clusters = [
      makeCluster({ name: 'cluster-1' }),
      makeCluster({ name: 'cluster-2' }),
    ]
    const result = detectClusterDeltas(deps, clusters)
    expect(result).toHaveLength(1)
    const replicaDelta = result[0].deltas!.find(
      (d) => d.dimension === 'Replica Count',
    )
    expect(replicaDelta!.significance).toBe('low')
  })

  it('generates pairwise deltas for 3 clusters (produces 3 pairs)', () => {
    const deps = [
      makeDeployment({ cluster: 'cluster-1', image: 'api:v1.0' }),
      makeDeployment({ cluster: 'cluster-2', image: 'api:v2.0' }),
      makeDeployment({ cluster: 'cluster-3', image: 'api:v3.0' }),
    ]
    const clusters = [
      makeCluster({ name: 'cluster-1' }),
      makeCluster({ name: 'cluster-2' }),
      makeCluster({ name: 'cluster-3' }),
    ]
    const result = detectClusterDeltas(deps, clusters)
    expect(result).toHaveLength(1)
    // 3 clusters => 3 pairwise image deltas (C(3,2) = 3)
    const imageDeltas = result[0].deltas!.filter(
      (d) => d.dimension === 'Image Version',
    )
    expect(imageDeltas).toHaveLength(3)
    expect(result[0].affectedClusters).toHaveLength(3)
  })

  it('sets severity to info when only low-significance deltas exist', () => {
    // Only replica difference, no high-significance delta
    const deps = [
      makeDeployment({ cluster: 'cluster-1', replicas: 9, image: 'api:v1.0' }),
      makeDeployment({ cluster: 'cluster-2', replicas: 10, image: 'api:v1.0' }),
    ]
    const clusters = [
      makeCluster({ name: 'cluster-1' }),
      makeCluster({ name: 'cluster-2' }),
    ]
    const result = detectClusterDeltas(deps, clusters)
    expect(result).toHaveLength(1)
    expect(result[0].severity).toBe('info')
  })
})

// ── Cascade Impact: deeper coverage ──────────────────────────────────

