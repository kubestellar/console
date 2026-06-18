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

