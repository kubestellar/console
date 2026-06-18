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

