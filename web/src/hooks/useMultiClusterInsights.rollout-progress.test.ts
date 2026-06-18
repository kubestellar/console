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


describe('trackRolloutProgress', () => {
  it('returns empty for no deployments', () => {
    expect(trackRolloutProgress([])).toEqual([])
  })

  it('handles undefined input gracefully', () => {
    expect(trackRolloutProgress(undefined as unknown as Deployment[])).toEqual(
      [],
    )
  })

  it('returns empty when all clusters have the same image', () => {
    const deps = [
      makeDeployment({ cluster: 'cluster-1', image: 'api:v1.0' }),
      makeDeployment({ cluster: 'cluster-2', image: 'api:v1.0' }),
    ]
    expect(trackRolloutProgress(deps)).toEqual([])
  })

  it('detects in-progress rollout with mixed image versions', () => {
    const deps = [
      makeDeployment({ cluster: 'cluster-1', image: 'api:v2.0' }),
      makeDeployment({ cluster: 'cluster-2', image: 'api:v2.0' }),
      makeDeployment({ cluster: 'cluster-3', image: 'api:v1.0' }),
    ]
    const result = trackRolloutProgress(deps)
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('rollout-tracker')
    expect(result[0].metrics).toBeDefined()
    expect(result[0].metrics!.total).toBe(3)
  })

  it('sets severity to warning when a cluster has failed status', () => {
    const deps = [
      makeDeployment({ cluster: 'cluster-1', image: 'api:v2.0' }),
      makeDeployment({ cluster: 'cluster-2', image: 'api:v2.0' }),
      makeDeployment({
        cluster: 'cluster-3',
        image: 'api:v1.0',
        status: 'failed',
      }),
    ]
    const result = trackRolloutProgress(deps)
    expect(result[0].severity).toBe('warning')
    expect(result[0].metrics!.failed).toBe(1)
  })

  it('treats highest semver image as newest', () => {
    // PR #6878 switched from frequency-based to semver-based ordering.
    // v2.0 is the highest semver, so it is "newest" even though v1.0
    // is deployed to more clusters (the old canary scenario).
    const deps = [
      makeDeployment({ cluster: 'cluster-1', image: 'api:v1.0' }),
      makeDeployment({ cluster: 'cluster-2', image: 'api:v1.0' }),
      makeDeployment({ cluster: 'cluster-3', image: 'api:v1.0' }),
      makeDeployment({ cluster: 'cluster-4', image: 'api:v2.0' }), // canary
    ]
    const result = trackRolloutProgress(deps)
    // v2.0 is newest by semver — only cluster-4 is completed
    expect(result[0].metrics!.completed).toBe(1)
    expect(result[0].metrics!.pending).toBe(3)
  })

  it('verifies per-cluster completed/pending/failed breakdown', () => {
    const deps = [
      makeDeployment({
        cluster: 'cluster-1',
        image: 'api:v2.0',
        status: 'running',
      }),
      makeDeployment({
        cluster: 'cluster-2',
        image: 'api:v2.0',
        status: 'running',
      }),
      makeDeployment({
        cluster: 'cluster-3',
        image: 'api:v1.0',
        status: 'running',
      }),
      makeDeployment({
        cluster: 'cluster-4',
        image: 'api:v1.0',
        status: 'failed',
      }),
    ]
    const result = trackRolloutProgress(deps)
    expect(result).toHaveLength(1)
    // v2.0 appears 2 times, v1.0 appears 2 times — tie-break by sort order,
    // but both have same count so the first sorted wins. Regardless:
    const metrics = result[0].metrics!
    expect(metrics.total).toBe(4)
    // failed clusters count toward total but are excluded from both
    // completed and pending, so completed + pending = total - failed
    expect(metrics.completed + metrics.pending).toBe(
      metrics.total - metrics.failed,
    )
    // Exactly 1 failed (cluster-4 has status: 'failed')
    expect(metrics.failed).toBe(1)
    // Verify affected clusters lists all 4
    expect(result[0].affectedClusters).toHaveLength(4)
  })
})

// ══════════════════════════════════════════════════════════════════════
// REGRESSION-PREVENTION TESTS
// 18 additional cases covering edge-case logic, severity escalation
// boundaries, multi-dimensional comparisons, and cross-algorithm
// interaction guarantees.
// ══════════════════════════════════════════════════════════════════════

// ── Event Correlations: deeper coverage ──────────────────────────────


describe('trackRolloutProgress — regression', () => {
  it('populates per-cluster progress and status metrics', () => {
    const deps = [
      makeDeployment({
        cluster: 'cluster-1',
        image: 'api:v2.0',
        status: 'running',
      }),
      makeDeployment({
        cluster: 'cluster-2',
        image: 'api:v1.0',
        status: 'running',
      }),
      makeDeployment({
        cluster: 'cluster-3',
        image: 'api:v1.0',
        status: 'failed',
      }),
    ]
    const result = trackRolloutProgress(deps)
    expect(result).toHaveLength(1)
    const metrics = result[0].metrics!

    // PR #6878: v2.0 is newest by semver (not frequency-based anymore)
    // cluster-1 has v2.0 (newest) => completed, progress=100
    expect(metrics['cluster-1_progress']).toBe(100)
    expect(metrics['cluster-1_status']).toBe(2) // ROLLOUT_STATUS_COMPLETE

    // cluster-2 has v1.0 (not newest, not failed) => pending
    // Progress is based on readyReplicas/replicas ratio (3/3 = 100)
    expect(metrics['cluster-2_progress']).toBe(100)
    expect(metrics['cluster-2_status']).toBe(1) // ROLLOUT_STATUS_IN_PROGRESS

    // cluster-3 has status=failed => progress=0, status=3
    expect(metrics['cluster-3_progress']).toBe(0)
    expect(metrics['cluster-3_status']).toBe(3) // ROLLOUT_STATUS_FAILED
  })

  it('skips workloads deployed to only one cluster', () => {
    const deps = [
      makeDeployment({
        cluster: 'cluster-1',
        image: 'api:v1.0',
        name: 'solo-app',
      }),
    ]
    expect(trackRolloutProgress(deps)).toEqual([])
  })

  it('excludes failed clusters from the pending count', () => {
    const deps = [
      makeDeployment({ cluster: 'cluster-1', image: 'api:v2.0', status: 'running' }),
      makeDeployment({ cluster: 'cluster-2', image: 'api:v2.0', status: 'running' }),
      makeDeployment({ cluster: 'cluster-3', image: 'api:v1.0', status: 'failed' }),
    ]
    const result = trackRolloutProgress(deps)
    expect(result).toHaveLength(1)
    const metrics = result[0].metrics!
    // v2.0 is newest by semver, cluster-3 has v1.0 with status=failed
    // pending = deployments with non-newest image AND status !== 'failed' => 0
    expect(metrics.pending).toBe(0)
    expect(metrics.failed).toBe(1)
    expect(metrics.completed).toBe(2)
  })
})
