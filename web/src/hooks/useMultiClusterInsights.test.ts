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

describe('pct', () => {
  it('returns 0 for undefined value', () => {
    expect(pct(undefined, 100)).toBe(0)
  })

  it('returns 0 for undefined total', () => {
    expect(pct(50, undefined)).toBe(0)
  })

  it('returns 0 when total is 0', () => {
    expect(pct(50, 0)).toBe(0)
  })

  it('calculates correct percentage', () => {
    expect(pct(25, 100)).toBe(25)
    expect(pct(1, 3)).toBe(33)
  })

  it('returns 0 when value is 0', () => {
    expect(pct(0, 100)).toBe(0)
  })
})

describe('parseTimestamp', () => {
  it('returns 0 for undefined', () => {
    expect(parseTimestamp(undefined)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseTimestamp('')).toBe(0)
  })

  it('parses valid ISO string', () => {
    const ts = '2026-01-15T10:00:00.000Z'
    expect(parseTimestamp(ts)).toBe(new Date(ts).getTime())
  })

  it('returns 0 for malformed date strings', () => {
    expect(parseTimestamp('not-a-date')).toBe(0)
    expect(parseTimestamp('abc123')).toBe(0)
  })
})

describe('generateId', () => {
  it('creates id from category and parts', () => {
    expect(generateId('config-drift', 'ns/app')).toBe('config-drift:ns/app')
  })

  it('joins multiple parts', () => {
    expect(generateId('restart-correlation', 'app-bug', 'ns/app')).toBe(
      'restart-correlation:app-bug:ns/app',
    )
  })
})

// ── Algorithm 1: Event Correlations ───────────────────────────────────

describe('detectEventCorrelations', () => {
  it('returns empty for no events', () => {
    expect(detectEventCorrelations([])).toEqual([])
  })

  it('handles undefined input gracefully', () => {
    expect(
      detectEventCorrelations(undefined as unknown as ClusterEvent[]),
    ).toEqual([])
  })

  it('returns empty for non-Warning events', () => {
    const events = [makeEvent({ type: 'Normal' })]
    expect(detectEventCorrelations(events)).toEqual([])
  })

  it('returns empty when events come from a single cluster', () => {
    const ts = new Date('2026-01-15T10:00:00Z').toISOString()
    const events = [
      makeEvent({ cluster: 'cluster-1', lastSeen: ts }),
      makeEvent({ cluster: 'cluster-1', lastSeen: ts }),
    ]
    expect(detectEventCorrelations(events)).toEqual([])
  })

  it('detects correlations when 2+ clusters have warnings in same time window', () => {
    const ts = new Date('2026-01-15T10:00:00Z').toISOString()
    const events = [
      makeEvent({ cluster: 'cluster-1', lastSeen: ts }),
      makeEvent({ cluster: 'cluster-2', lastSeen: ts }),
    ]
    const result = detectEventCorrelations(events)
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('event-correlation')
    expect(result[0].affectedClusters).toEqual(
      expect.arrayContaining(['cluster-1', 'cluster-2']),
    )
  })

  it('escalates severity to critical when 3+ clusters affected', () => {
    const ts = new Date('2026-01-15T10:00:00Z').toISOString()
    const events = [
      makeEvent({ cluster: 'cluster-1', lastSeen: ts }),
      makeEvent({ cluster: 'cluster-2', lastSeen: ts }),
      makeEvent({ cluster: 'cluster-3', lastSeen: ts }),
    ]
    const result = detectEventCorrelations(events)
    expect(result).toHaveLength(1)
    expect(result[0].severity).toBe('critical')
  })

  it('does not correlate events in different time windows', () => {
    const ts1 = new Date('2026-01-15T10:00:00Z').toISOString()
    // 10 min later — different 5-min window
    const ts2 = new Date('2026-01-15T10:10:00Z').toISOString()
    const events = [
      makeEvent({ cluster: 'cluster-1', lastSeen: ts1 }),
      makeEvent({ cluster: 'cluster-2', lastSeen: ts2 }),
    ]
    const result = detectEventCorrelations(events)
    expect(result).toHaveLength(0)
  })

  it('skips events without lastSeen', () => {
    const ts = new Date('2026-01-15T10:00:00Z').toISOString()
    const events = [
      makeEvent({ cluster: 'cluster-1', lastSeen: ts }),
      makeEvent({ cluster: 'cluster-2', lastSeen: undefined }),
    ]
    expect(detectEventCorrelations(events)).toEqual([])
  })

  it('skips events with malformed timestamps instead of crashing', () => {
    const events = [
      makeEvent({ cluster: 'cluster-1', lastSeen: 'not-a-date' }),
      makeEvent({ cluster: 'cluster-2', lastSeen: 'also-bad' }),
    ]
    // parseTimestamp returns 0 for invalid dates, and the ts === 0 guard skips them
    expect(detectEventCorrelations(events)).toEqual([])
  })

  it('truncates results to MAX_INSIGHTS_PER_CATEGORY', () => {
    // Create 12 distinct time windows, each with events from 2 clusters
    const base = new Date('2026-01-15T00:00:00Z').getTime()
    const events: ClusterEvent[] = []
    const hoursPerWindow = 60 * 60 * 1000
    for (let i = 0; i < MAX_INSIGHTS_PER_CATEGORY + 2; i++) {
      // Each window is spaced well apart (1 hour) so they don't merge
      const ts = new Date(base + i * hoursPerWindow).toISOString()
      events.push(
        makeEvent({ cluster: 'cluster-1', lastSeen: ts }),
        makeEvent({ cluster: 'cluster-2', lastSeen: ts }),
      )
    }
    const result = detectEventCorrelations(events)
    expect(result).toHaveLength(MAX_INSIGHTS_PER_CATEGORY)
  })
})

// ── Algorithm 2: Cluster Deltas ───────────────────────────────────────

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

describe('detectCascadeImpact', () => {
  it('returns empty for fewer than 2 warnings', () => {
    const events = [makeEvent({ cluster: 'cluster-1' })]
    expect(detectCascadeImpact(events)).toEqual([])
  })

  it('handles undefined input gracefully', () => {
    expect(detectCascadeImpact(undefined as unknown as ClusterEvent[])).toEqual(
      [],
    )
  })

  it('returns empty when all warnings are from the same cluster', () => {
    const base = new Date('2026-01-15T10:00:00Z')
    const oneMinuteMs = 60000
    const events = [
      makeEvent({ cluster: 'cluster-1', lastSeen: base.toISOString() }),
      makeEvent({
        cluster: 'cluster-1',
        lastSeen: new Date(base.getTime() + oneMinuteMs).toISOString(),
      }),
    ]
    expect(detectCascadeImpact(events)).toEqual([])
  })

  it('detects cascade when warnings spread across clusters within 15 min', () => {
    const base = new Date('2026-01-15T10:00:00Z')
    const events = [
      makeEvent({ cluster: 'cluster-1', lastSeen: base.toISOString() }),
      makeEvent({
        cluster: 'cluster-2',
        lastSeen: new Date(
          base.getTime() + EVENT_CORRELATION_WINDOW_MS,
        ).toISOString(),
      }),
    ]
    const result = detectCascadeImpact(events)
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('cascade-impact')
    expect(result[0].chain).toHaveLength(MIN_CORRELATED_CLUSTERS)
    expect(result[0].affectedClusters).toEqual(
      expect.arrayContaining(['cluster-1', 'cluster-2']),
    )
  })

  it('escalates to critical at 3+ clusters in cascade', () => {
    const base = new Date('2026-01-15T10:00:00Z')
    const oneMinuteMs = 60000
    const twoMinutesMs = 120000
    const events = [
      makeEvent({ cluster: 'cluster-1', lastSeen: base.toISOString() }),
      makeEvent({
        cluster: 'cluster-2',
        lastSeen: new Date(base.getTime() + oneMinuteMs).toISOString(),
      }),
      makeEvent({
        cluster: 'cluster-3',
        lastSeen: new Date(base.getTime() + twoMinutesMs).toISOString(),
      }),
    ]
    const result = detectCascadeImpact(events)
    expect(result).toHaveLength(1)
    expect(result[0].severity).toBe('critical')
  })

  it('includes event exactly at 15-minute boundary (> check, not >=)', () => {
    const base = new Date('2026-01-15T10:00:00Z')
    const events = [
      makeEvent({ cluster: 'cluster-1', lastSeen: base.toISOString() }),
      makeEvent({
        cluster: 'cluster-2',
        lastSeen: new Date(
          base.getTime() + CASCADE_DETECTION_WINDOW_MS,
        ).toISOString(),
      }),
    ]
    // ts - baseTs === CASCADE_DETECTION_WINDOW_MS, and the check is `> CASCADE_DETECTION_WINDOW_MS`,
    // so exactly-at-boundary should NOT break, i.e. the event IS included
    const result = detectCascadeImpact(events)
    expect(result).toHaveLength(1)
    expect(result[0].chain).toHaveLength(MIN_CORRELATED_CLUSTERS)
  })

  it('excludes event 1ms past the 15-minute boundary', () => {
    const base = new Date('2026-01-15T10:00:00Z')
    const events = [
      makeEvent({ cluster: 'cluster-1', lastSeen: base.toISOString() }),
      makeEvent({
        cluster: 'cluster-2',
        lastSeen: new Date(
          base.getTime() + CASCADE_DETECTION_WINDOW_MS + 1,
        ).toISOString(),
      }),
    ]
    // 1ms past the window — should NOT be included in the chain
    expect(detectCascadeImpact(events)).toEqual([])
  })
})

// ── Algorithm 4: Config Drift ─────────────────────────────────────────

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

describe('detectEventCorrelations — regression', () => {
  it('aggregates event counts from the same cluster in a window', () => {
    const ts = new Date('2026-01-15T10:00:00Z').toISOString()
    const events = [
      makeEvent({ cluster: 'cluster-1', lastSeen: ts, count: 5, reason: 'BackOff' }),
      makeEvent({ cluster: 'cluster-1', lastSeen: ts, count: 3, reason: 'OOMKilled' }),
      makeEvent({ cluster: 'cluster-2', lastSeen: ts, count: 2, reason: 'BackOff' }),
    ]
    const result = detectEventCorrelations(events)
    expect(result).toHaveLength(1)
    // Total events = 5 + 3 + 2 = 10
    expect(result[0].description).toContain('10 warning events')
  })

  it('produces separate insights for multiple distinct time windows', () => {
    const baseMs = new Date('2026-01-15T00:00:00Z').getTime()
    // Two windows separated by 2 hours (well beyond the 5-min correlation window)
    const twoHoursMs = 2 * 60 * 60 * 1000
    const ts1 = new Date(baseMs).toISOString()
    const ts2 = new Date(baseMs + twoHoursMs).toISOString()
    const events = [
      makeEvent({ cluster: 'cluster-1', lastSeen: ts1 }),
      makeEvent({ cluster: 'cluster-2', lastSeen: ts1 }),
      makeEvent({ cluster: 'cluster-3', lastSeen: ts2 }),
      makeEvent({ cluster: 'cluster-4', lastSeen: ts2 }),
    ]
    const result = detectEventCorrelations(events)
    expect(result).toHaveLength(2)
    // Each insight should have 2 affected clusters
    expect(result[0].affectedClusters).toHaveLength(2)
    expect(result[1].affectedClusters).toHaveLength(2)
  })

  it('populates relatedResources from event objects (capped at 5)', () => {
    const ts = new Date('2026-01-15T10:00:00Z').toISOString()
    const events = Array.from({ length: 8 }, (_, i) =>
      makeEvent({
        cluster: i < 4 ? 'cluster-1' : 'cluster-2',
        lastSeen: ts,
        object: `pod/unique-pod-${i}`,
      }),
    )
    const result = detectEventCorrelations(events)
    expect(result).toHaveLength(1)
    // relatedResources are capped at 5
    expect(result[0].relatedResources!.length).toBeLessThanOrEqual(5)
  })
})

// ── Cluster Deltas: deeper coverage ──────────────────────────────────

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

describe('detectCascadeImpact — regression', () => {
  it('produces multiple independent cascade chains', () => {
    // Two cascades well separated in time (>15 min apart)
    const base1 = new Date('2026-01-15T10:00:00Z')
    const base2 = new Date('2026-01-15T11:00:00Z')
    const oneMinuteMs = 60000
    const events = [
      makeEvent({ cluster: 'cluster-1', lastSeen: base1.toISOString() }),
      makeEvent({
        cluster: 'cluster-2',
        lastSeen: new Date(base1.getTime() + oneMinuteMs).toISOString(),
      }),
      makeEvent({ cluster: 'cluster-3', lastSeen: base2.toISOString() }),
      makeEvent({
        cluster: 'cluster-4',
        lastSeen: new Date(base2.getTime() + oneMinuteMs).toISOString(),
      }),
    ]
    const result = detectCascadeImpact(events)
    expect(result).toHaveLength(2)
    expect(result[0].affectedClusters).toEqual(
      expect.arrayContaining(['cluster-1', 'cluster-2']),
    )
    expect(result[1].affectedClusters).toEqual(
      expect.arrayContaining(['cluster-3', 'cluster-4']),
    )
  })

  it('does not reuse events already consumed by an earlier cascade', () => {
    const base = new Date('2026-01-15T10:00:00Z')
    const oneMinuteMs = 60000
    const events = [
      makeEvent({ cluster: 'cluster-1', lastSeen: base.toISOString() }),
      makeEvent({
        cluster: 'cluster-2',
        lastSeen: new Date(base.getTime() + oneMinuteMs).toISOString(),
      }),
      // cluster-3 is within 15 min of cluster-1 but cluster-2 is consumed
      makeEvent({
        cluster: 'cluster-3',
        lastSeen: new Date(base.getTime() + 2 * oneMinuteMs).toISOString(),
      }),
    ]
    const result = detectCascadeImpact(events)
    // All 3 in one cascade (cluster-1 starts it, cluster-2 and cluster-3 join)
    expect(result).toHaveLength(1)
    expect(result[0].chain).toHaveLength(3)
  })

  it('preserves chronological chain ordering', () => {
    const base = new Date('2026-01-15T10:00:00Z')
    const oneMinuteMs = 60000
    const twoMinutesMs = 120000
    const events = [
      makeEvent({
        cluster: 'cluster-3',
        lastSeen: new Date(base.getTime() + twoMinutesMs).toISOString(),
        reason: 'CrashLoop',
      }),
      makeEvent({
        cluster: 'cluster-1',
        lastSeen: base.toISOString(),
        reason: 'FailedMount',
      }),
      makeEvent({
        cluster: 'cluster-2',
        lastSeen: new Date(base.getTime() + oneMinuteMs).toISOString(),
        reason: 'Unhealthy',
      }),
    ]
    const result = detectCascadeImpact(events)
    expect(result).toHaveLength(1)
    // Chain should be sorted by timestamp: cluster-1 -> cluster-2 -> cluster-3
    expect(result[0].chain![0].cluster).toBe('cluster-1')
    expect(result[0].chain![1].cluster).toBe('cluster-2')
    expect(result[0].chain![2].cluster).toBe('cluster-3')
  })

  it('does NOT falsely correlate unrelated events from different reason families and workloads (#4925)', () => {
    const base = new Date('2026-01-15T10:00:00Z')
    const fiveMinutesMs = 300000
    const events = [
      makeEvent({
        cluster: 'cluster-A',
        reason: 'ImagePullBackOff',
        object: 'pod/frontend-7d9f8b6c4f-x2k4q',
        lastSeen: base.toISOString(),
      }),
      makeEvent({
        cluster: 'cluster-B',
        reason: 'NodeNotReady',
        object: 'node/worker-3',
        lastSeen: new Date(base.getTime() + fiveMinutesMs).toISOString(),
      }),
    ]
    // Different reason families AND different workload prefixes => no cascade
    expect(detectCascadeImpact(events)).toEqual([])
  })

  it('correlates events from the same reason family even with different objects', () => {
    const base = new Date('2026-01-15T10:00:00Z')
    const oneMinuteMs = 60000
    const events = [
      makeEvent({
        cluster: 'cluster-1',
        reason: 'ImagePullBackOff',
        object: 'pod/api-abc12-xyz',
        lastSeen: base.toISOString(),
      }),
      makeEvent({
        cluster: 'cluster-2',
        reason: 'ErrImagePull',
        object: 'pod/worker-def34-uvw',
        lastSeen: new Date(base.getTime() + oneMinuteMs).toISOString(),
      }),
    ]
    // Same reason family (image issues) => cascade detected
    const result = detectCascadeImpact(events)
    expect(result).toHaveLength(1)
    expect(result[0].affectedClusters).toEqual(
      expect.arrayContaining(['cluster-1', 'cluster-2']),
    )
  })

  it('correlates events from the same workload even with different reasons', () => {
    const base = new Date('2026-01-15T10:00:00Z')
    const oneMinuteMs = 60000
    const events = [
      makeEvent({
        cluster: 'cluster-1',
        reason: 'FailedMount',
        object: 'pod/api-server-7d9f8b6c4f-x2k4q',
        lastSeen: base.toISOString(),
      }),
      makeEvent({
        cluster: 'cluster-2',
        reason: 'CrashLoopBackOff',
        object: 'pod/api-server-8a3e2c1d5b-m7n2p',
        lastSeen: new Date(base.getTime() + oneMinuteMs).toISOString(),
      }),
    ]
    // Same workload prefix "api-server" => cascade detected
    const result = detectCascadeImpact(events)
    expect(result).toHaveLength(1)
    expect(result[0].affectedClusters).toEqual(
      expect.arrayContaining(['cluster-1', 'cluster-2']),
    )
  })
})

// ── Config Drift: deeper coverage ────────────────────────────────────

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
