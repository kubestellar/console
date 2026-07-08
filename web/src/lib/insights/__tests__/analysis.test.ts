/**
 * Unit tests for lib/insights/analysis.ts — multi-cluster insight detection.
 *
 * Covers: detectEventCorrelations, detectClusterDeltas, detectCascadeImpact,
 * detectConfigDrift, detectResourceImbalance, detectRestartCorrelation,
 * trackRolloutProgress, buildInsights, groupInsightsByCategory, getTopInsights.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  detectEventCorrelations,
  detectClusterDeltas,
  detectCascadeImpact,
  detectConfigDrift,
  detectResourceImbalance,
  detectRestartCorrelation,
  trackRolloutProgress,
  buildInsights,
  groupInsightsByCategory,
  getTopInsights,
} from '../analysis'
import type { ClusterEvent, ClusterInfo, Deployment, PodIssue } from '../../../hooks/mcp/types'

// Stable timestamp for deterministic tests
const BASE_TS = '2025-06-01T12:00:00Z'
const BASE_MS = new Date(BASE_TS).getTime()

afterEach(() => { vi.restoreAllMocks() })

// ---------------------------------------------------------------------------
// detectEventCorrelations
// ---------------------------------------------------------------------------

describe('detectEventCorrelations', () => {
  it('returns empty for no events', () => {
    expect(detectEventCorrelations([])).toEqual([])
  })

  it('returns empty when events are from only one cluster', () => {
    const events: ClusterEvent[] = [
      { type: 'Warning', cluster: 'a', reason: 'BackOff', lastSeen: BASE_TS, object: 'pod/x', count: 1 },
      { type: 'Warning', cluster: 'a', reason: 'Unhealthy', lastSeen: BASE_TS, object: 'pod/y', count: 1 },
    ]
    expect(detectEventCorrelations(events)).toEqual([])
  })

  it('detects correlation when warnings in ≥2 clusters within same time window', () => {
    const events: ClusterEvent[] = [
      { type: 'Warning', cluster: 'east', reason: 'BackOff', lastSeen: BASE_TS, object: 'pod/app-a', count: 2 },
      { type: 'Warning', cluster: 'west', reason: 'OOMKilled', lastSeen: BASE_TS, object: 'pod/app-b', count: 1 },
    ]
    const insights = detectEventCorrelations(events)
    expect(insights.length).toBeGreaterThan(0)
    expect(insights[0].category).toBe('event-correlation')
    expect(insights[0].affectedClusters).toContain('east')
    expect(insights[0].affectedClusters).toContain('west')
  })

  it('ignores Normal events', () => {
    const events: ClusterEvent[] = [
      { type: 'Normal', cluster: 'east', reason: 'Pulled', lastSeen: BASE_TS, object: 'pod/a', count: 1 },
      { type: 'Normal', cluster: 'west', reason: 'Scheduled', lastSeen: BASE_TS, object: 'pod/b', count: 1 },
    ]
    expect(detectEventCorrelations(events)).toEqual([])
  })

  it('marks severity as critical when ≥3 clusters affected', () => {
    const events: ClusterEvent[] = [
      { type: 'Warning', cluster: 'a', reason: 'BackOff', lastSeen: BASE_TS, object: 'pod/x', count: 1 },
      { type: 'Warning', cluster: 'b', reason: 'OOMKilled', lastSeen: BASE_TS, object: 'pod/y', count: 1 },
      { type: 'Warning', cluster: 'c', reason: 'Unhealthy', lastSeen: BASE_TS, object: 'pod/z', count: 1 },
    ]
    const insights = detectEventCorrelations(events)
    expect(insights[0].severity).toBe('critical')
  })
})

// ---------------------------------------------------------------------------
// detectClusterDeltas
// ---------------------------------------------------------------------------

describe('detectClusterDeltas', () => {
  it('returns empty for empty deployments', () => {
    expect(detectClusterDeltas([], [])).toEqual([])
  })

  it('returns empty when fewer than 2 clusters', () => {
    const deps: Deployment[] = [
      { name: 'app', namespace: 'ns', cluster: 'a', image: 'img:v1', replicas: 2, readyReplicas: 2, status: 'running' },
    ]
    expect(detectClusterDeltas(deps, [{ name: 'a' }] as any)).toEqual([])
  })

  it('detects image version delta across clusters', () => {
    const deps: Deployment[] = [
      { name: 'app', namespace: 'ns', cluster: 'east', image: 'app:v1', replicas: 3, readyReplicas: 3, status: 'running' },
      { name: 'app', namespace: 'ns', cluster: 'west', image: 'app:v2', replicas: 3, readyReplicas: 3, status: 'running' },
    ]
    const clusters = [{ name: 'east' }, { name: 'west' }] as ClusterInfo[]
    const insights = detectClusterDeltas(deps, clusters)
    expect(insights.length).toBe(1)
    expect(insights[0].category).toBe('cluster-delta')
    expect(insights[0].deltas!.some(d => d.dimension === 'Image Version')).toBe(true)
  })

  it('detects replica count delta with significance', () => {
    const deps: Deployment[] = [
      { name: 'app', namespace: 'ns', cluster: 'a', image: 'img:v1', replicas: 10, readyReplicas: 10, status: 'running' },
      { name: 'app', namespace: 'ns', cluster: 'b', image: 'img:v1', replicas: 2, readyReplicas: 2, status: 'running' },
    ]
    const clusters = [{ name: 'a' }, { name: 'b' }] as ClusterInfo[]
    const insights = detectClusterDeltas(deps, clusters)
    const replicaDelta = insights[0].deltas!.find(d => d.dimension === 'Replica Count')
    expect(replicaDelta).toBeDefined()
    expect(replicaDelta!.significance).toBe('high') // 80% diff
  })

  it('detects status differences', () => {
    const deps: Deployment[] = [
      { name: 'app', namespace: 'ns', cluster: 'a', image: 'img:v1', replicas: 3, readyReplicas: 3, status: 'running' },
      { name: 'app', namespace: 'ns', cluster: 'b', image: 'img:v1', replicas: 3, readyReplicas: 0, status: 'failed' },
    ]
    const clusters = [{ name: 'a' }, { name: 'b' }] as ClusterInfo[]
    const insights = detectClusterDeltas(deps, clusters)
    expect(insights[0].severity).toBe('warning') // has high-significance delta
  })
})

// ---------------------------------------------------------------------------
// detectCascadeImpact
// ---------------------------------------------------------------------------

describe('detectCascadeImpact', () => {
  it('returns empty for fewer than 2 warnings', () => {
    expect(detectCascadeImpact([])).toEqual([])
    expect(detectCascadeImpact([
      { type: 'Warning', cluster: 'a', reason: 'BackOff', lastSeen: BASE_TS, object: 'pod/x', count: 1 },
    ])).toEqual([])
  })

  it('detects cascade when causally related events span clusters within time window', () => {
    // Same reason family → causally related
    const events: ClusterEvent[] = [
      { type: 'Warning', cluster: 'a', reason: 'BackOff', lastSeen: BASE_TS, object: 'pod/app-abc-xyz', count: 1 },
      { type: 'Warning', cluster: 'b', reason: 'CrashLoopBackOff', lastSeen: new Date(BASE_MS + 60_000).toISOString(), object: 'pod/app-def-uvw', count: 1 },
    ]
    const insights = detectCascadeImpact(events)
    expect(insights.length).toBe(1)
    expect(insights[0].category).toBe('cascade-impact')
    expect(insights[0].chain!.length).toBe(2)
  })

  it('does not detect cascade for events beyond time window', () => {
    const events: ClusterEvent[] = [
      { type: 'Warning', cluster: 'a', reason: 'BackOff', lastSeen: BASE_TS, object: 'pod/app-a', count: 1 },
      { type: 'Warning', cluster: 'b', reason: 'BackOff', lastSeen: new Date(BASE_MS + 20 * 60_000).toISOString(), object: 'pod/app-b', count: 1 },
    ]
    expect(detectCascadeImpact(events)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// detectConfigDrift
// ---------------------------------------------------------------------------

describe('detectConfigDrift', () => {
  it('returns empty for empty deployments', () => {
    expect(detectConfigDrift([])).toEqual([])
  })

  it('returns empty when all copies have same image and replicas', () => {
    const deps: Deployment[] = [
      { name: 'app', namespace: 'ns', cluster: 'a', image: 'img:v1', replicas: 3, readyReplicas: 3, status: 'running' },
      { name: 'app', namespace: 'ns', cluster: 'b', image: 'img:v1', replicas: 3, readyReplicas: 3, status: 'running' },
    ]
    expect(detectConfigDrift(deps)).toEqual([])
  })

  it('detects drift when images differ', () => {
    const deps: Deployment[] = [
      { name: 'app', namespace: 'ns', cluster: 'a', image: 'img:v1', replicas: 3, readyReplicas: 3, status: 'running' },
      { name: 'app', namespace: 'ns', cluster: 'b', image: 'img:v2', replicas: 3, readyReplicas: 3, status: 'running' },
    ]
    const insights = detectConfigDrift(deps)
    expect(insights.length).toBe(1)
    expect(insights[0].category).toBe('config-drift')
    expect(insights[0].severity).toBe('warning')
  })

  it('detects drift when replica counts differ', () => {
    const deps: Deployment[] = [
      { name: 'app', namespace: 'ns', cluster: 'a', image: 'img:v1', replicas: 1, readyReplicas: 1, status: 'running' },
      { name: 'app', namespace: 'ns', cluster: 'b', image: 'img:v1', replicas: 5, readyReplicas: 5, status: 'running' },
    ]
    const insights = detectConfigDrift(deps)
    expect(insights.length).toBe(1)
    expect(insights[0].severity).toBe('info') // only replica diff, not image
  })
})

// ---------------------------------------------------------------------------
// detectResourceImbalance
// ---------------------------------------------------------------------------

describe('detectResourceImbalance', () => {
  it('returns empty for fewer than 2 healthy clusters', () => {
    expect(detectResourceImbalance([])).toEqual([])
    expect(detectResourceImbalance([{ name: 'a', cpuCores: 8, cpuUsageCores: 4, healthy: true }] as any)).toEqual([])
  })

  it('returns empty when clusters are balanced', () => {
    const clusters: ClusterInfo[] = [
      { name: 'a', cpuCores: 8, cpuUsageCores: 4, healthy: true },
      { name: 'b', cpuCores: 8, cpuUsageCores: 4, healthy: true },
    ] as any
    expect(detectResourceImbalance(clusters)).toEqual([])
  })

  it('detects CPU imbalance when one cluster is heavily loaded', () => {
    const clusters: ClusterInfo[] = [
      { name: 'hot', cpuCores: 8, cpuUsageCores: 7.5, healthy: true },
      { name: 'cold', cpuCores: 8, cpuUsageCores: 1, healthy: true },
    ] as any
    const insights = detectResourceImbalance(clusters)
    expect(insights.length).toBeGreaterThan(0)
    expect(insights[0].category).toBe('resource-imbalance')
    expect(insights[0].affectedClusters).toContain('hot')
  })

  it('marks critical when CPU exceeds critical threshold', () => {
    const clusters: ClusterInfo[] = [
      { name: 'overloaded', cpuCores: 8, cpuUsageCores: 7.2, healthy: true }, // 90%
      { name: 'idle', cpuCores: 8, cpuUsageCores: 0.5, healthy: true }, // 6%
    ] as any
    const insights = detectResourceImbalance(clusters)
    expect(insights[0].severity).toBe('critical')
  })

  it('skips unhealthy clusters', () => {
    const clusters: ClusterInfo[] = [
      { name: 'bad', cpuCores: 8, cpuUsageCores: 7.5, healthy: false },
      { name: 'good', cpuCores: 8, cpuUsageCores: 2, healthy: true },
    ] as any
    // Only 1 healthy cluster → returns empty
    expect(detectResourceImbalance(clusters)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// detectRestartCorrelation
// ---------------------------------------------------------------------------

describe('detectRestartCorrelation', () => {
  it('returns empty when no pods exceed restart threshold', () => {
    const issues: PodIssue[] = [
      { name: 'app-abc-xyz', namespace: 'ns', cluster: 'a', restarts: 1, status: 'CrashLoopBackOff' },
    ] as any
    expect(detectRestartCorrelation(issues)).toEqual([])
  })

  it('detects app bug pattern (same workload restarting in multiple clusters)', () => {
    const issues: PodIssue[] = [
      { name: 'web-abc-xyz', namespace: 'ns', cluster: 'east', restarts: 5, status: 'CrashLoopBackOff' },
      { name: 'web-def-uvw', namespace: 'ns', cluster: 'west', restarts: 4, status: 'CrashLoopBackOff' },
    ] as any
    const insights = detectRestartCorrelation(issues)
    const appBug = insights.find(i => i.title.includes('likely app bug'))
    expect(appBug).toBeDefined()
    expect(appBug!.affectedClusters).toContain('east')
    expect(appBug!.affectedClusters).toContain('west')
  })

  it('detects infra issue pattern (many workloads restarting in same cluster)', () => {
    const issues: PodIssue[] = [
      { name: 'app1-abc-xyz', namespace: 'ns', cluster: 'broken', restarts: 5, status: 'CrashLoopBackOff' },
      { name: 'app2-abc-xyz', namespace: 'ns', cluster: 'broken', restarts: 4, status: 'CrashLoopBackOff' },
      { name: 'app3-abc-xyz', namespace: 'ns', cluster: 'broken', restarts: 6, status: 'CrashLoopBackOff' },
    ] as any
    const insights = detectRestartCorrelation(issues)
    const infra = insights.find(i => i.title.includes('likely infra issue'))
    expect(infra).toBeDefined()
    expect(infra!.affectedClusters).toContain('broken')
  })
})

// ---------------------------------------------------------------------------
// trackRolloutProgress
// ---------------------------------------------------------------------------

describe('trackRolloutProgress', () => {
  it('returns empty for empty deployments', () => {
    expect(trackRolloutProgress([])).toEqual([])
  })

  it('returns empty when workload exists in only one cluster', () => {
    const deps: Deployment[] = [
      { name: 'app', namespace: 'ns', cluster: 'a', image: 'img:v2', replicas: 3, readyReplicas: 3, status: 'running' },
    ]
    expect(trackRolloutProgress(deps)).toEqual([])
  })

  it('detects rollout when images differ across clusters', () => {
    const deps: Deployment[] = [
      { name: 'app', namespace: 'ns', cluster: 'a', image: 'img:v2', replicas: 3, readyReplicas: 3, status: 'running' },
      { name: 'app', namespace: 'ns', cluster: 'b', image: 'img:v1', replicas: 3, readyReplicas: 3, status: 'running' },
    ]
    const insights = trackRolloutProgress(deps)
    expect(insights.length).toBe(1)
    expect(insights[0].category).toBe('rollout-tracker')
    expect(insights[0].metrics!['completed']).toBe(1)
    expect(insights[0].metrics!['pending']).toBe(1)
  })

  it('marks warning severity when a cluster has failed', () => {
    const deps: Deployment[] = [
      { name: 'app', namespace: 'ns', cluster: 'a', image: 'img:v2', replicas: 3, readyReplicas: 3, status: 'running' },
      { name: 'app', namespace: 'ns', cluster: 'b', image: 'img:v1', replicas: 3, readyReplicas: 0, status: 'failed' },
    ]
    const insights = trackRolloutProgress(deps)
    expect(insights[0].severity).toBe('warning')
    expect(insights[0].metrics!['failed']).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// buildInsights
// ---------------------------------------------------------------------------

describe('buildInsights', () => {
  it('returns empty when all inputs are empty', () => {
    const result = buildInsights({
      deduplicatedClusters: [],
      deployments: [],
      events: [],
      podIssues: [],
      warningEvents: [],
    })
    expect(result).toEqual([])
  })

  it('sorts results by severity (critical first)', () => {
    const events: ClusterEvent[] = [
      { type: 'Warning', cluster: 'a', reason: 'BackOff', lastSeen: BASE_TS, object: 'pod/x', count: 1 },
      { type: 'Warning', cluster: 'b', reason: 'OOMKilled', lastSeen: BASE_TS, object: 'pod/y', count: 1 },
      { type: 'Warning', cluster: 'c', reason: 'Unhealthy', lastSeen: BASE_TS, object: 'pod/z', count: 1 },
    ]
    const result = buildInsights({
      deduplicatedClusters: [],
      deployments: [],
      events,
      podIssues: [],
      warningEvents: [],
    })
    if (result.length >= 2) {
      const severityOrder = ['critical', 'warning', 'info']
      const idx0 = severityOrder.indexOf(result[0].severity)
      const idx1 = severityOrder.indexOf(result[1].severity)
      expect(idx0).toBeLessThanOrEqual(idx1)
    }
  })
})

// ---------------------------------------------------------------------------
// groupInsightsByCategory
// ---------------------------------------------------------------------------

describe('groupInsightsByCategory', () => {
  it('returns empty categories for empty input', () => {
    const result = groupInsightsByCategory([])
    expect(result['event-correlation']).toEqual([])
    expect(result['cluster-delta']).toEqual([])
  })

  it('groups insights correctly', () => {
    const insights = [
      { id: '1', category: 'event-correlation', severity: 'warning', title: 'A', description: '', affectedClusters: [], source: 'heuristic', detectedAt: '' },
      { id: '2', category: 'cluster-delta', severity: 'info', title: 'B', description: '', affectedClusters: [], source: 'heuristic', detectedAt: '' },
      { id: '3', category: 'event-correlation', severity: 'critical', title: 'C', description: '', affectedClusters: [], source: 'heuristic', detectedAt: '' },
    ] as any
    const result = groupInsightsByCategory(insights)
    expect(result['event-correlation']).toHaveLength(2)
    expect(result['cluster-delta']).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// getTopInsights
// ---------------------------------------------------------------------------

describe('getTopInsights', () => {
  it('returns empty for empty input', () => {
    expect(getTopInsights([])).toEqual([])
  })

  it('limits to MAX_TOP_INSIGHTS (5)', () => {
    const insights = Array.from({ length: 10 }, (_, i) => ({
      id: String(i), category: 'event-correlation', severity: 'warning',
      title: `Insight ${i}`, description: '', affectedClusters: [],
      source: 'heuristic', detectedAt: '',
    })) as any
    expect(getTopInsights(insights)).toHaveLength(5)
  })
})
