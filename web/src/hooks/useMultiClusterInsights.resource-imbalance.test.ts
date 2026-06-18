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


describe('detectResourceImbalance', () => {
  it('returns empty for fewer than 2 clusters', () => {
    const clusters = [makeCluster({ name: 'cluster-1', cpuCores: 8 })]
    expect(detectResourceImbalance(clusters)).toEqual([])
  })

  it('handles undefined input gracefully', () => {
    expect(
      detectResourceImbalance(undefined as unknown as ClusterInfo[]),
    ).toEqual([])
  })

  it('returns empty when clusters are balanced', () => {
    const clusters = [
      makeCluster({ name: 'cluster-1', cpuCores: 8, cpuUsageCores: 4 }),
      makeCluster({ name: 'cluster-2', cpuCores: 8, cpuUsageCores: 4 }),
    ]
    expect(detectResourceImbalance(clusters)).toEqual([])
  })

  it('detects CPU imbalance when usage differs significantly', () => {
    const clusters = [
      makeCluster({ name: 'cluster-1', cpuCores: 10, cpuUsageCores: 9 }), // 90%
      makeCluster({ name: 'cluster-2', cpuCores: 10, cpuUsageCores: 2 }), // 20%
    ]
    const result = detectResourceImbalance(clusters)
    expect(result).toHaveLength(1)
    const cpuInsight = result.find((i) => i.title.includes('CPU'))
    expect(cpuInsight).toBeDefined()
    expect(cpuInsight!.category).toBe('resource-imbalance')
  })

  it(`marks critical when any cluster exceeds ${CPU_CRITICAL_THRESHOLD_PCT}%`, () => {
    const clusters = [
      makeCluster({ name: 'cluster-1', cpuCores: 10, cpuUsageCores: 9 }), // 90% > 85%
      makeCluster({ name: 'cluster-2', cpuCores: 10, cpuUsageCores: 2 }), // 20%
    ]
    const result = detectResourceImbalance(clusters)
    const cpuInsight = result.find((i) => i.title.includes('CPU'))
    expect(cpuInsight!.severity).toBe('critical')
  })

  it('detects memory imbalance', () => {
    const clusters = [
      makeCluster({
        name: 'cluster-1',
        cpuCores: 8,
        memoryGB: 32,
        memoryUsageGB: 28,
      }), // 88%
      makeCluster({
        name: 'cluster-2',
        cpuCores: 8,
        memoryGB: 32,
        memoryUsageGB: 5,
      }), // 16%
    ]
    const result = detectResourceImbalance(clusters)
    const memInsight = result.find((i) => i.title.includes('Memory'))
    expect(memInsight).toBeDefined()
  })

  it('skips unhealthy clusters', () => {
    const clusters = [
      makeCluster({
        name: 'cluster-1',
        healthy: false,
        cpuCores: 10,
        cpuUsageCores: 9,
      }),
      makeCluster({ name: 'cluster-2', cpuCores: 10, cpuUsageCores: 2 }),
    ]
    // Only 1 healthy cluster with cpuCores > 0, so it returns empty
    expect(detectResourceImbalance(clusters)).toEqual([])
  })
})

// ── Algorithm 6: Restart Correlation ──────────────────────────────────


describe('detectResourceImbalance — regression', () => {
  it('detects both CPU and memory imbalance simultaneously', () => {
    const clusters = [
      makeCluster({
        name: 'cluster-1',
        cpuCores: 10,
        cpuUsageCores: 9,  // 90%
        memoryGB: 32,
        memoryUsageGB: 28, // 88%
      }),
      makeCluster({
        name: 'cluster-2',
        cpuCores: 10,
        cpuUsageCores: 2,  // 20%
        memoryGB: 32,
        memoryUsageGB: 5,  // 16%
      }),
    ]
    const result = detectResourceImbalance(clusters)
    const cpuInsight = result.find((i) => i.title.includes('CPU'))
    const memInsight = result.find((i) => i.title.includes('Memory'))
    expect(cpuInsight).toBeDefined()
    expect(memInsight).toBeDefined()
  })

  it('uses cpuRequestsCores when cpuUsageCores is absent', () => {
    const clusters = [
      makeCluster({
        name: 'cluster-1',
        cpuCores: 10,
        cpuRequestsCores: 9,
        cpuUsageCores: undefined,
      }), // 90%
      makeCluster({
        name: 'cluster-2',
        cpuCores: 10,
        cpuRequestsCores: 2,
        cpuUsageCores: undefined,
      }), // 20%
    ]
    const result = detectResourceImbalance(clusters)
    const cpuInsight = result.find((i) => i.title.includes('CPU'))
    expect(cpuInsight).toBeDefined()
    expect(cpuInsight!.metrics!['cluster-1']).toBe(90)
    expect(cpuInsight!.metrics!['cluster-2']).toBe(20)
  })

  it('marks memory imbalance as critical when utilization exceeds threshold', () => {
    const clusters = [
      makeCluster({
        name: 'cluster-1',
        cpuCores: 8,
        memoryGB: 32,
        memoryUsageGB: 30, // 94% > 85%
      }),
      makeCluster({
        name: 'cluster-2',
        cpuCores: 8,
        memoryGB: 32,
        memoryUsageGB: 5,  // 16%
      }),
    ]
    const result = detectResourceImbalance(clusters)
    const memInsight = result.find((i) => i.title.includes('Memory'))
    expect(memInsight).toBeDefined()
    expect(memInsight!.severity).toBe('critical')
  })

  it('skips clusters with zero cpuCores (prevents division by zero)', () => {
    const clusters = [
      makeCluster({ name: 'cluster-1', cpuCores: 0, cpuUsageCores: 0 }),
      makeCluster({ name: 'cluster-2', cpuCores: 0, cpuUsageCores: 0 }),
    ]
    // cpuCores === 0 means filter excludes them (c.cpuCores > 0)
    expect(detectResourceImbalance(clusters)).toEqual([])
  })
})

// ── Restart Correlation: deeper coverage ─────────────────────────────

