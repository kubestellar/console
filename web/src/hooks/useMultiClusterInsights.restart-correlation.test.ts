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


describe('detectRestartCorrelation', () => {
  it('returns empty for no issues', () => {
    expect(detectRestartCorrelation([])).toEqual([])
  })

  it('handles undefined input gracefully', () => {
    expect(
      detectRestartCorrelation(undefined as unknown as PodIssue[]),
    ).toEqual([])
  })

  it(`returns empty when restarts are below threshold (${RESTART_CORRELATION_THRESHOLD})`, () => {
    const issues = [makePodIssue({ restarts: 1 })]
    expect(detectRestartCorrelation(issues)).toEqual([])
  })

  it('detects horizontal pattern (app bug): same workload across clusters', () => {
    const issues = [
      makePodIssue({
        name: 'api-server-abc123-xyz',
        cluster: 'cluster-1',
        restarts: 5,
      }),
      makePodIssue({
        name: 'api-server-def456-uvw',
        cluster: 'cluster-2',
        restarts: 3,
      }),
    ]
    const result = detectRestartCorrelation(issues)
    const appBug = result.find((i) => i.title.includes('app bug'))
    expect(appBug).toBeDefined()
    expect(appBug!.affectedClusters).toHaveLength(2)
  })

  it('detects vertical pattern (infra issue): multiple workloads in one cluster', () => {
    const issues = [
      makePodIssue({
        name: 'api-server-abc-xyz',
        cluster: 'cluster-1',
        restarts: 5,
      }),
      makePodIssue({
        name: 'cache-redis-abc-xyz',
        cluster: 'cluster-1',
        restarts: 4,
      }),
      makePodIssue({
        name: 'worker-queue-abc-xyz',
        cluster: 'cluster-1',
        restarts: 6,
      }),
    ]
    const result = detectRestartCorrelation(issues)
    const infraIssue = result.find((i) => i.title.includes('infra issue'))
    expect(infraIssue).toBeDefined()
    expect(infraIssue!.affectedClusters).toEqual(['cluster-1'])
  })

  it(`escalates app bug to critical when total restarts > ${RESTART_CRITICAL_THRESHOLD}`, () => {
    const issues = [
      makePodIssue({
        name: 'api-server-abc-xyz',
        cluster: 'cluster-1',
        restarts: 15,
      }),
      makePodIssue({
        name: 'api-server-def-uvw',
        cluster: 'cluster-2',
        restarts: 10,
      }),
    ]
    const result = detectRestartCorrelation(issues)
    const appBug = result.find((i) => i.title.includes('app bug'))
    expect(appBug!.severity).toBe('critical')
  })

  it(`escalates infra issue to critical when ${INFRA_CRITICAL_WORKLOADS}+ workloads restarting`, () => {
    const issues = Array.from({ length: INFRA_CRITICAL_WORKLOADS }, (_, i) =>
      makePodIssue({
        name: `workload-${i}-abc-xyz`,
        cluster: 'cluster-1',
        restarts: 5,
      }),
    )
    const result = detectRestartCorrelation(issues)
    const infraIssue = result.find((i) => i.title.includes('infra issue'))
    expect(infraIssue!.severity).toBe('critical')
  })
})

// ── Algorithm 7: Rollout Tracking ─────────────────────────────────────


describe('detectRestartCorrelation — regression', () => {
  it('strips pod hash suffix correctly for short names (fewer than 3 segments)', () => {
    // A pod name with only 1 segment (no dashes) — the fallback keeps the full name
    const issues = [
      makePodIssue({ name: 'singleton', cluster: 'cluster-1', restarts: 5 }),
      makePodIssue({ name: 'singleton', cluster: 'cluster-2', restarts: 5 }),
    ]
    const result = detectRestartCorrelation(issues)
    const appBug = result.find((i) => i.title.includes('app bug'))
    expect(appBug).toBeDefined()
    // Workload name is just "singleton" because parts.length <= 2
    expect(appBug!.relatedResources).toEqual(
      expect.arrayContaining([expect.stringContaining('singleton')]),
    )
  })

  it('produces both horizontal and vertical patterns for the same data set', () => {
    // api-server restarts in 2 clusters (app bug) + 3 different workloads
    // restart in cluster-1 (infra issue)
    const issues = [
      makePodIssue({
        name: 'api-server-abc-xyz',
        cluster: 'cluster-1',
        restarts: 5,
      }),
      makePodIssue({
        name: 'api-server-def-uvw',
        cluster: 'cluster-2',
        restarts: 5,
      }),
      makePodIssue({
        name: 'cache-redis-abc-xyz',
        cluster: 'cluster-1',
        restarts: 4,
      }),
      makePodIssue({
        name: 'worker-queue-abc-xyz',
        cluster: 'cluster-1',
        restarts: 6,
      }),
    ]
    const result = detectRestartCorrelation(issues)
    const appBug = result.find((i) => i.title.includes('app bug'))
    const infraIssue = result.find((i) => i.title.includes('infra issue'))
    expect(appBug).toBeDefined()
    expect(infraIssue).toBeDefined()
  })

  it('accumulates restarts from multiple pods of the same workload in one cluster', () => {
    // Two pods of "api-server" in cluster-1, different hashes
    const issues = [
      makePodIssue({
        name: 'api-server-abc-111',
        cluster: 'cluster-1',
        restarts: 8,
      }),
      makePodIssue({
        name: 'api-server-def-222',
        cluster: 'cluster-1',
        restarts: 7,
      }),
      makePodIssue({
        name: 'api-server-ghi-333',
        cluster: 'cluster-2',
        restarts: 6,
      }),
    ]
    const result = detectRestartCorrelation(issues)
    const appBug = result.find((i) => i.title.includes('app bug'))
    expect(appBug).toBeDefined()
    // Total restarts across clusters: cluster-1 has 8+7=15, cluster-2 has 6; total = 21
    // 21 > RESTART_CRITICAL_THRESHOLD(20) → critical
    expect(appBug!.severity).toBe('critical')
  })
})

// ── Rollout Tracking: deeper coverage ────────────────────────────────

