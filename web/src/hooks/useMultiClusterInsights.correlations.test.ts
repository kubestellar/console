import { describe, it, expect } from 'vitest'
import { pct, parseTimestamp, generateId, detectEventCorrelations, detectClusterDeltas, detectCascadeImpact, EVENT_CORRELATION_WINDOW_MS, CASCADE_DETECTION_WINDOW_MS, MAX_INSIGHTS_PER_CATEGORY, MIN_CORRELATED_CLUSTERS } from './useMultiClusterInsights'
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