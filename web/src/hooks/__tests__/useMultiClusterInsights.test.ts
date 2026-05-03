import { describe, it, expect } from 'vitest'
import {
  generateId,
  parseTimestamp,
  pct,
  detectEventCorrelations,
  detectClusterDeltas,
  detectCascadeImpact,
  detectConfigDrift,
  detectResourceImbalance,
  detectRestartCorrelation,
  trackRolloutProgress,
  EVENT_CORRELATION_WINDOW_MS,
  RESTART_CORRELATION_THRESHOLD,
  CPU_CRITICAL_THRESHOLD_PCT,
  RESTART_CRITICAL_THRESHOLD,
  INFRA_CRITICAL_WORKLOADS,
  CRITICAL_CLUSTER_THRESHOLD,
} from '../useMultiClusterInsights'
import type { ClusterEvent, Deployment, PodIssue } from '../mcp/types'
import type { ClusterInfo } from '../mcp/types'

// ---------------------------------------------------------------------------
// generateId
// ---------------------------------------------------------------------------

describe('generateId', () => {
  it('joins category and parts with colons', () => {
    expect(generateId('event-correlation', 'a', 'b')).toBe('event-correlation:a:b')
  })

  it('works with single part', () => {
    expect(generateId('config-drift', 'key')).toBe('config-drift:key')
  })
})

// ---------------------------------------------------------------------------
// parseTimestamp
// ---------------------------------------------------------------------------

describe('parseTimestamp', () => {
  it('parses ISO string to epoch ms', () => {
    expect(parseTimestamp('2024-01-01T00:00:00.000Z')).toBe(1704067200000)
  })

  it('returns 0 for undefined', () => {
    expect(parseTimestamp(undefined)).toBe(0)
  })

  it('returns 0 for invalid date string', () => {
    expect(parseTimestamp('not-a-date')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// pct
// ---------------------------------------------------------------------------

describe('pct', () => {
  it('computes rounded percentage', () => {
    expect(pct(50, 200)).toBe(25)
  })

  it('returns 0 when total is 0', () => {
    expect(pct(50, 0)).toBe(0)
  })

  it('returns 0 when value is undefined', () => {
    expect(pct(undefined, 100)).toBe(0)
  })

  it('returns 0 when total is undefined', () => {
    expect(pct(50, undefined)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// detectEventCorrelations
// ---------------------------------------------------------------------------

describe('detectEventCorrelations', () => {
  const baseTs = '2024-06-01T12:00:00.000Z'
  const baseMs = new Date(baseTs).getTime()

  function makeEvent(cluster: string, offsetMs = 0): ClusterEvent {
    return {
      type: 'Warning',
      reason: 'BackOff',
      object: 'pod/api-server-abc12-xyz',
      message: 'Back-off restarting',
      count: 1,
      firstSeen: baseTs,
      lastSeen: new Date(baseMs + offsetMs).toISOString(),
      cluster,
      namespace: 'default',
    }
  }

  it('returns empty for no events', () => {
    expect(detectEventCorrelations([])).toEqual([])
  })

  it('returns empty when events are from a single cluster', () => {
    const events = [makeEvent('cluster-a'), makeEvent('cluster-a', 1000)]
    expect(detectEventCorrelations(events)).toEqual([])
  })

  it('correlates events from multiple clusters in the same time window', () => {
    const events = [
      makeEvent('cluster-a'),
      makeEvent('cluster-b', 1000),
    ]
    const results = detectEventCorrelations(events)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].category).toBe('event-correlation')
    expect(results[0].affectedClusters).toContain('cluster-a')
    expect(results[0].affectedClusters).toContain('cluster-b')
  })

  it('does NOT correlate events in different time windows', () => {
    const events = [
      makeEvent('cluster-a'),
      makeEvent('cluster-b', EVENT_CORRELATION_WINDOW_MS + 1000),
    ]
    const results = detectEventCorrelations(events)
    expect(results).toEqual([])
  })

  it('escalates to critical when >= CRITICAL_CLUSTER_THRESHOLD clusters', () => {
    const events = Array.from({ length: CRITICAL_CLUSTER_THRESHOLD }, (_, i) =>
      makeEvent(`cluster-${i}`, i * 100),
    )
    const results = detectEventCorrelations(events)
    expect(results.length).toBe(1)
    expect(results[0].severity).toBe('critical')
  })

  it('filters out non-Warning events', () => {
    const events = [
      { ...makeEvent('cluster-a'), type: 'Normal' },
      { ...makeEvent('cluster-b'), type: 'Normal' },
    ]
    expect(detectEventCorrelations(events)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// detectClusterDeltas
// ---------------------------------------------------------------------------

describe('detectClusterDeltas', () => {
  function makeDep(overrides: Partial<Deployment>): Deployment {
    return {
      name: 'api-server',
      namespace: 'default',
      replicas: 3,
      readyReplicas: 3,
      status: 'running',
      image: 'api-server:v1.0.0',
      cluster: 'cluster-a',
      conditions: [],
      ...overrides,
    }
  }

  it('returns empty when no deployments', () => {
    expect(detectClusterDeltas([], [])).toEqual([])
  })

  it('returns empty when fewer than 2 clusters for a workload', () => {
    expect(detectClusterDeltas([makeDep({})], [{ name: 'cluster-a' } as ClusterInfo])).toEqual([])
  })

  it('detects image version delta', () => {
    const deps = [
      makeDep({ cluster: 'cluster-a', image: 'api-server:v1.0.0' }),
      makeDep({ cluster: 'cluster-b', image: 'api-server:v2.0.0' }),
    ]
    const clusters = [{ name: 'cluster-a' }, { name: 'cluster-b' }] as ClusterInfo[]
    const results = detectClusterDeltas(deps, clusters)
    expect(results.length).toBe(1)
    expect(results[0].deltas!.some(d => d.dimension === 'Image Version')).toBe(true)
  })

  it('detects replica count delta', () => {
    const deps = [
      makeDep({ cluster: 'cluster-a', replicas: 3 }),
      makeDep({ cluster: 'cluster-b', replicas: 1 }),
    ]
    const clusters = [{ name: 'cluster-a' }, { name: 'cluster-b' }] as ClusterInfo[]
    const results = detectClusterDeltas(deps, clusters)
    expect(results[0].deltas!.some(d => d.dimension === 'Replica Count')).toBe(true)
  })

  it('detects status delta with high significance for failed', () => {
    const deps = [
      makeDep({ cluster: 'cluster-a', status: 'running' }),
      makeDep({ cluster: 'cluster-b', status: 'failed' }),
    ]
    const clusters = [{ name: 'cluster-a' }, { name: 'cluster-b' }] as ClusterInfo[]
    const results = detectClusterDeltas(deps, clusters)
    const statusDelta = results[0].deltas!.find(d => d.dimension === 'Status')
    expect(statusDelta?.significance).toBe('high')
  })

  it('returns no insights when deployments are identical', () => {
    const deps = [
      makeDep({ cluster: 'cluster-a' }),
      makeDep({ cluster: 'cluster-b' }),
    ]
    const clusters = [{ name: 'cluster-a' }, { name: 'cluster-b' }] as ClusterInfo[]
    expect(detectClusterDeltas(deps, clusters)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// detectCascadeImpact
// ---------------------------------------------------------------------------

describe('detectCascadeImpact', () => {
  const baseTs = '2024-06-01T12:00:00.000Z'
  const baseMs = new Date(baseTs).getTime()

  function makeEvent(cluster: string, reason: string, object: string, offsetMs = 0): ClusterEvent {
    return {
      type: 'Warning',
      reason,
      object,
      message: 'test',
      count: 1,
      firstSeen: baseTs,
      lastSeen: new Date(baseMs + offsetMs).toISOString(),
      cluster,
      namespace: 'default',
    }
  }

  it('returns empty for fewer than 2 events', () => {
    expect(detectCascadeImpact([makeEvent('c1', 'BackOff', 'pod/a')])).toEqual([])
  })

  it('detects cascade across clusters with same reason family', () => {
    const events = [
      makeEvent('cluster-a', 'BackOff', 'pod/api-abc12-xyz', 0),
      makeEvent('cluster-b', 'CrashLoopBackOff', 'pod/api-def34-uvw', 60_000),
    ]
    const results = detectCascadeImpact(events)
    expect(results.length).toBe(1)
    expect(results[0].category).toBe('cascade-impact')
    expect(results[0].chain!.length).toBe(2)
  })

  it('detects cascade across clusters with same workload prefix', () => {
    const events = [
      makeEvent('cluster-a', 'Unhealthy', 'pod/api-server-7d9f8-x2k4q', 0),
      makeEvent('cluster-b', 'FailedScheduling', 'pod/api-server-8b6c4-y3m5r', 60_000),
    ]
    const results = detectCascadeImpact(events)
    expect(results.length).toBe(1)
  })

  it('does NOT cascade unrelated events in different families', () => {
    const events = [
      makeEvent('cluster-a', 'BackOff', 'pod/api-abc12-xyz', 0),
      makeEvent('cluster-b', 'FailedMount', 'pod/storage-def34-uvw', 60_000),
    ]
    expect(detectCascadeImpact(events)).toEqual([])
  })

  it('does NOT cascade events on the same cluster', () => {
    const events = [
      makeEvent('cluster-a', 'BackOff', 'pod/api-abc12-xyz', 0),
      makeEvent('cluster-a', 'CrashLoopBackOff', 'pod/api-def34-uvw', 60_000),
    ]
    expect(detectCascadeImpact(events)).toEqual([])
  })

  it('escalates to critical for >= CRITICAL_CLUSTER_THRESHOLD clusters', () => {
    const events = Array.from({ length: CRITICAL_CLUSTER_THRESHOLD }, (_, i) =>
      makeEvent(`cluster-${i}`, 'BackOff', `pod/api-${i}`, i * 10_000),
    )
    const results = detectCascadeImpact(events)
    expect(results[0].severity).toBe('critical')
  })
})

// ---------------------------------------------------------------------------
// detectConfigDrift
// ---------------------------------------------------------------------------

describe('detectConfigDrift', () => {
  function makeDep(overrides: Partial<Deployment>): Deployment {
    return {
      name: 'api-server',
      namespace: 'default',
      replicas: 3,
      readyReplicas: 3,
      status: 'running',
      image: 'api-server:v1.0.0',
      cluster: 'cluster-a',
      conditions: [],
      ...overrides,
    }
  }

  it('returns empty for no deployments', () => {
    expect(detectConfigDrift([])).toEqual([])
  })

  it('returns empty when deployments are identical', () => {
    const deps = [makeDep({ cluster: 'c1' }), makeDep({ cluster: 'c2' })]
    expect(detectConfigDrift(deps)).toEqual([])
  })

  it('detects image drift with warning severity', () => {
    const deps = [
      makeDep({ cluster: 'c1', image: 'app:v1' }),
      makeDep({ cluster: 'c2', image: 'app:v2' }),
    ]
    const results = detectConfigDrift(deps)
    expect(results.length).toBe(1)
    expect(results[0].severity).toBe('warning')
    expect(results[0].description).toContain('different images')
  })

  it('detects replica drift with info severity', () => {
    const deps = [
      makeDep({ cluster: 'c1', replicas: 3 }),
      makeDep({ cluster: 'c2', replicas: 5 }),
    ]
    const results = detectConfigDrift(deps)
    expect(results.length).toBe(1)
    expect(results[0].severity).toBe('info')
    expect(results[0].description).toContain('different replica counts')
  })
})

// ---------------------------------------------------------------------------
// detectResourceImbalance
// ---------------------------------------------------------------------------

describe('detectResourceImbalance', () => {
  function makeCluster(name: string, cpuCores: number, cpuUsageCores: number, memoryGB = 64, memoryUsageGB = 20): ClusterInfo {
    return {
      name,
      healthy: true,
      cpuCores,
      cpuUsageCores,
      cpuRequestsCores: cpuUsageCores,
      memoryGB,
      memoryUsageGB,
      memoryRequestsGB: memoryUsageGB,
    } as ClusterInfo
  }

  it('returns empty with fewer than 2 healthy clusters', () => {
    expect(detectResourceImbalance([makeCluster('c1', 100, 50)])).toEqual([])
  })

  it('returns empty when clusters are balanced', () => {
    const clusters = [
      makeCluster('c1', 100, 50),
      makeCluster('c2', 100, 55),
    ]
    expect(detectResourceImbalance(clusters)).toEqual([])
  })

  it('detects CPU imbalance', () => {
    const clusters = [
      makeCluster('c1', 100, 90),
      makeCluster('c2', 100, 10),
    ]
    const results = detectResourceImbalance(clusters)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].title).toContain('CPU')
  })

  it('escalates to critical when CPU exceeds threshold', () => {
    const clusters = [
      makeCluster('c1', 100, CPU_CRITICAL_THRESHOLD_PCT + 5),
      makeCluster('c2', 100, 10),
    ]
    const results = detectResourceImbalance(clusters)
    expect(results[0].severity).toBe('critical')
  })

  it('detects memory imbalance', () => {
    const clusters = [
      makeCluster('c1', 100, 50, 64, 60),
      makeCluster('c2', 100, 50, 64, 5),
    ]
    const results = detectResourceImbalance(clusters)
    const memInsight = results.find(r => r.title.includes('Memory'))
    expect(memInsight).toBeDefined()
  })

  it('skips unhealthy clusters', () => {
    const clusters = [
      { ...makeCluster('c1', 100, 90), healthy: false } as ClusterInfo,
      makeCluster('c2', 100, 10),
    ]
    expect(detectResourceImbalance(clusters)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// detectRestartCorrelation
// ---------------------------------------------------------------------------

describe('detectRestartCorrelation', () => {
  function makeIssue(name: string, cluster: string, restarts: number): PodIssue {
    return {
      name,
      namespace: 'default',
      cluster,
      restarts,
      status: 'CrashLoopBackOff',
      reason: 'BackOff',
      message: 'restarting',
      nodeName: 'node-1',
    }
  }

  it('returns empty when no issues meet restart threshold', () => {
    expect(detectRestartCorrelation([
      makeIssue('api-server-abc12-xyz', 'c1', RESTART_CORRELATION_THRESHOLD - 1),
    ])).toEqual([])
  })

  it('detects horizontal pattern (app bug)', () => {
    const issues = [
      makeIssue('api-server-abc12-xyz', 'cluster-a', 5),
      makeIssue('api-server-def34-uvw', 'cluster-b', 5),
    ]
    const results = detectRestartCorrelation(issues)
    const appBug = results.find(r => r.title.includes('app bug'))
    expect(appBug).toBeDefined()
  })

  it('detects vertical pattern (infra issue)', () => {
    const issues = [
      makeIssue('api-server-abc12-xyz', 'cluster-a', 5),
      makeIssue('cache-redis-abc12-xyz', 'cluster-a', 5),
      makeIssue('metrics-col-abc12-xyz', 'cluster-a', 5),
    ]
    const results = detectRestartCorrelation(issues)
    const infraIssue = results.find(r => r.title.includes('infra issue'))
    expect(infraIssue).toBeDefined()
  })

  it('escalates app bug to critical when restarts exceed threshold', () => {
    const issues = [
      makeIssue('api-server-abc12-xyz', 'cluster-a', RESTART_CRITICAL_THRESHOLD),
      makeIssue('api-server-def34-uvw', 'cluster-b', 5),
    ]
    const results = detectRestartCorrelation(issues)
    const appBug = results.find(r => r.title.includes('app bug'))
    expect(appBug?.severity).toBe('critical')
  })

  it('escalates infra issue to critical when >= INFRA_CRITICAL_WORKLOADS', () => {
    const issues = Array.from({ length: INFRA_CRITICAL_WORKLOADS }, (_, i) =>
      makeIssue(`workload-${i}-abc12-xyz`, 'cluster-a', 5),
    )
    const results = detectRestartCorrelation(issues)
    const infraIssue = results.find(r => r.title.includes('infra issue'))
    expect(infraIssue?.severity).toBe('critical')
  })
})

// ---------------------------------------------------------------------------
// trackRolloutProgress
// ---------------------------------------------------------------------------

describe('trackRolloutProgress', () => {
  function makeDep(overrides: Partial<Deployment>): Deployment {
    return {
      name: 'api-server',
      namespace: 'default',
      replicas: 3,
      readyReplicas: 3,
      status: 'running',
      image: 'api-server:v1.0.0',
      cluster: 'cluster-a',
      conditions: [],
      ...overrides,
    }
  }

  it('returns empty for no deployments', () => {
    expect(trackRolloutProgress([])).toEqual([])
  })

  it('returns empty when all have same image', () => {
    const deps = [makeDep({ cluster: 'c1' }), makeDep({ cluster: 'c2' })]
    expect(trackRolloutProgress(deps)).toEqual([])
  })

  it('tracks rollout with mixed images', () => {
    const deps = [
      makeDep({ cluster: 'c1', image: 'app:v2.0.0' }),
      makeDep({ cluster: 'c2', image: 'app:v1.0.0' }),
      makeDep({ cluster: 'c3', image: 'app:v2.0.0' }),
    ]
    const results = trackRolloutProgress(deps)
    expect(results.length).toBe(1)
    expect(results[0].category).toBe('rollout-tracker')
    expect(results[0].metrics?.completed).toBe(2)
    expect(results[0].metrics?.pending).toBe(1)
  })

  it('marks failed deployments with 0 progress', () => {
    const deps = [
      makeDep({ cluster: 'c1', image: 'app:v2.0.0' }),
      makeDep({ cluster: 'c2', image: 'app:v1.0.0', status: 'failed' }),
    ]
    const results = trackRolloutProgress(deps)
    expect(results[0].metrics?.failed).toBe(1)
    expect(results[0].metrics?.['c2_progress']).toBe(0)
    expect(results[0].severity).toBe('warning')
  })

  it('uses semver ordering to identify newest image', () => {
    const deps = [
      makeDep({ cluster: 'c1', image: 'app:v1.0.0' }),
      makeDep({ cluster: 'c2', image: 'app:v2.0.0' }),
      makeDep({ cluster: 'c3', image: 'app:v1.5.0' }),
    ]
    const results = trackRolloutProgress(deps)
    expect(results[0].description).toContain('app:v2.0.0')
  })

  it('computes actual readyReplicas progress for pending clusters', () => {
    const deps = [
      makeDep({ cluster: 'c1', image: 'app:v2.0.0' }),
      makeDep({ cluster: 'c2', image: 'app:v1.0.0', replicas: 4, readyReplicas: 2 }),
    ]
    const results = trackRolloutProgress(deps)
    expect(results[0].metrics?.['c2_progress']).toBe(50)
  })
})
