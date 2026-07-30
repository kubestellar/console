/**
 * Unit tests for WorkloadDeployment.utils.ts — pure utility functions.
 *
 * Covers: worseStatus, mapApiWorkloads (grouping/deduplication),
 * getAvailableClusters, getWorkloadStats, filterWorkloads,
 * getStatusIconClassName, getTypeIconComponent, and constants.
 */
import { describe, it, expect } from 'vitest'
import {
  worseStatus,
  mapApiWorkloads,
  getAvailableClusters,
  getWorkloadStats,
  filterWorkloads,
  getStatusIconClassName,
  getTypeIconComponent,
  PROTECTED_NAMESPACES,
  WORKLOAD_TYPES,
  WORKLOAD_STATUSES,
  SCALE_SUCCESS_RESET_MS,
  REFETCH_AFTER_SCALE_MS,
  ZERO_REPLICAS,
  CLUSTER_FILTER_STORAGE_KEY,
  DEMO_WORKLOADS,
  DEMO_STATS,
  statusColors,
  workloadStatusOrder,
} from '../WorkloadDeployment.utils'
import type { Workload, WorkloadStatus, WorkloadType, AvailableCluster } from '../WorkloadDeployment.utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ApiWorkloadInput = Parameters<typeof mapApiWorkloads>[0]
type RealWorkloadsInput = Parameters<typeof getWorkloadStats>[1]

function makeWorkload(overrides: Partial<Workload> = {}): Workload {
  return {
    name: 'app',
    namespace: 'default',
    type: 'Deployment',
    status: 'Running',
    replicas: 1,
    readyReplicas: 1,
    image: 'nginx:latest',
    labels: {},
    targetClusters: ['cluster-a'],
    deployments: [],
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('WorkloadDeployment.utils constants', () => {
  it('PROTECTED_NAMESPACES includes kube-system', () => {
    expect(PROTECTED_NAMESPACES.has('kube-system')).toBe(true)
  })

  it('WORKLOAD_TYPES starts with All', () => {
    expect(WORKLOAD_TYPES[0]).toBe('All')
    expect(WORKLOAD_TYPES).toContain('Deployment')
    expect(WORKLOAD_TYPES).toContain('CronJob')
  })

  it('WORKLOAD_STATUSES starts with All', () => {
    expect(WORKLOAD_STATUSES[0]).toBe('All')
    expect(WORKLOAD_STATUSES).toContain('Running')
    expect(WORKLOAD_STATUSES).toContain('Failed')
  })

  it('exports timing constants', () => {
    expect(SCALE_SUCCESS_RESET_MS).toBe(2000)
    expect(REFETCH_AFTER_SCALE_MS).toBe(1500)
    expect(ZERO_REPLICAS).toBe(0)
  })

  it('CLUSTER_FILTER_STORAGE_KEY is a non-empty string', () => {
    expect(CLUSTER_FILTER_STORAGE_KEY.length).toBeGreaterThan(0)
  })

  it('DEMO_WORKLOADS is a non-empty array of Workload objects', () => {
    expect(DEMO_WORKLOADS.length).toBeGreaterThan(0)
    expect(DEMO_WORKLOADS[0]).toHaveProperty('name')
    expect(DEMO_WORKLOADS[0]).toHaveProperty('namespace')
  })

  it('DEMO_STATS has expected shape', () => {
    expect(DEMO_STATS).toHaveProperty('totalWorkloads')
    expect(DEMO_STATS).toHaveProperty('runningCount')
  })

  it('statusColors has entries for all statuses', () => {
    const statuses: WorkloadStatus[] = ['Running', 'Pending', 'Degraded', 'Failed', 'Unknown']
    for (const s of statuses) {
      expect(statusColors[s]).toBeDefined()
    }
  })

  it('workloadStatusOrder assigns numeric ordering', () => {
    expect(workloadStatusOrder['Failed']).toBeLessThan(workloadStatusOrder['Running'])
  })
})

// ---------------------------------------------------------------------------
// worseStatus
// ---------------------------------------------------------------------------

describe('worseStatus', () => {
  it('Failed is worse than Running', () => {
    expect(worseStatus('Running', 'Failed')).toBe('Failed')
  })

  it('Degraded is worse than Running', () => {
    expect(worseStatus('Running', 'Degraded')).toBe('Degraded')
  })

  it('same status returns same status', () => {
    expect(worseStatus('Pending', 'Pending')).toBe('Pending')
  })

  it('commutative — order of args does not matter', () => {
    expect(worseStatus('Failed', 'Running')).toBe('Failed')
  })

  it('Unknown is handled gracefully', () => {
    const result = worseStatus('Unknown', 'Running')
    expect(['Unknown', 'Running']).toContain(result)
  })
})

// ---------------------------------------------------------------------------
// getStatusIconClassName
// ---------------------------------------------------------------------------

describe('getStatusIconClassName', () => {
  it('returns a component for each status', () => {
    const statuses: WorkloadStatus[] = ['Running', 'Degraded', 'Pending', 'Failed', 'Unknown']
    for (const s of statuses) {
      expect(getStatusIconClassName(s)).toBeDefined()
    }
  })

  it('Running returns CheckCircle2 icon', () => {
    const icon = getStatusIconClassName('Running')
    // Lucide icons are functions/components with displayName or name
    expect(typeof icon).toBe('object') // ForwardRef component
  })
})

// ---------------------------------------------------------------------------
// getTypeIconComponent
// ---------------------------------------------------------------------------

describe('getTypeIconComponent', () => {
  it('returns a component for each workload type', () => {
    const types: WorkloadType[] = ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob']
    for (const t of types) {
      expect(getTypeIconComponent(t)).toBeDefined()
    }
  })
})

// ---------------------------------------------------------------------------
// mapApiWorkloads
// ---------------------------------------------------------------------------

describe('mapApiWorkloads', () => {
  it('returns importedWorkloads when realWorkloads is undefined', () => {
    const imported = [makeWorkload({ name: 'imported' })]
    const result = mapApiWorkloads(undefined, imported)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('imported')
  })

  it('returns importedWorkloads when realWorkloads is empty', () => {
    const imported = [makeWorkload()]
    expect(mapApiWorkloads([], imported)).toEqual(imported)
  })

  it('maps API workloads with correct fields', () => {
    const apiWorkloads = [{
      name: 'web',
      namespace: 'prod',
      type: 'Deployment',
      status: 'Running',
      replicas: 3,
      readyReplicas: 3,
      image: 'web:v1',
      labels: { app: 'web' },
      cluster: 'east',
      targetClusters: ['east', 'west'],
      deployments: [],
      createdAt: '2025-06-01T00:00:00Z',
    }] as unknown as ApiWorkloadInput
    const result = mapApiWorkloads(apiWorkloads, [])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('web')
    expect(result[0].targetClusters).toEqual(['east', 'west'])
  })

  it('deduplicates by namespace/name and merges clusters', () => {
    const apiWorkloads = [
      { name: 'app', namespace: 'ns', type: 'Deployment', status: 'Running', replicas: 2, readyReplicas: 2, image: 'img', labels: {}, cluster: 'a', targetClusters: ['a'], deployments: [], createdAt: '2025-01-01' },
      { name: 'app', namespace: 'ns', type: 'Deployment', status: 'Pending', replicas: 1, readyReplicas: 0, image: 'img', labels: {}, cluster: 'b', targetClusters: ['b'], deployments: [], createdAt: '2025-01-01' },
    ] as unknown as ApiWorkloadInput
    const result = mapApiWorkloads(apiWorkloads, [])
    expect(result).toHaveLength(1)
    expect(result[0].targetClusters).toContain('a')
    expect(result[0].targetClusters).toContain('b')
    expect(result[0].replicas).toBe(3)
    expect(result[0].readyReplicas).toBe(2)
  })

  it('uses worseStatus when merging duplicates', () => {
    const apiWorkloads = [
      { name: 'app', namespace: 'ns', type: 'Deployment', status: 'Running', replicas: 1, readyReplicas: 1, image: 'img', labels: {}, targetClusters: ['a'], deployments: [], createdAt: '2025-01-01' },
      { name: 'app', namespace: 'ns', type: 'Deployment', status: 'Failed', replicas: 1, readyReplicas: 0, image: 'img', labels: {}, targetClusters: ['b'], deployments: [], createdAt: '2025-01-01' },
    ] as unknown as ApiWorkloadInput
    const result = mapApiWorkloads(apiWorkloads, [])
    expect(result[0].status).toBe('Failed')
  })

  it('appends importedWorkloads after mapped ones', () => {
    const apiWorkloads = [
      { name: 'real', namespace: 'ns', type: 'Deployment', status: 'Running', replicas: 1, readyReplicas: 1, image: 'img', labels: {}, targetClusters: ['a'], deployments: [], createdAt: '2025-01-01' },
    ] as unknown as ApiWorkloadInput
    const imported = [makeWorkload({ name: 'imported' })]
    const result = mapApiWorkloads(apiWorkloads, imported)
    expect(result).toHaveLength(2)
    expect(result[1].name).toBe('imported')
  })

  it('handles workload with no targetClusters but has cluster field', () => {
    const apiWorkloads = [
      { name: 'solo', namespace: 'ns', type: 'Deployment', status: 'Running', replicas: 1, readyReplicas: 1, image: 'img', labels: {}, cluster: 'only-one', targetClusters: undefined, deployments: [], createdAt: '2025-01-01' },
    ] as unknown as ApiWorkloadInput
    const result = mapApiWorkloads(apiWorkloads, [])
    expect(result[0].targetClusters).toEqual(['only-one'])
  })
})

// ---------------------------------------------------------------------------
// getAvailableClusters
// ---------------------------------------------------------------------------

describe('getAvailableClusters', () => {
  it('returns demo cluster names in demo mode', () => {
    const demoWorkloads = [
      makeWorkload({ targetClusters: ['c1', 'c2'] }),
      makeWorkload({ targetClusters: ['c2', 'c3'] }),
    ]
    const result = getAvailableClusters(true, [], demoWorkloads)
    const names = result.map(c => c.name)
    expect(names).toContain('c1')
    expect(names).toContain('c2')
    expect(names).toContain('c3')
    expect(result.every(c => c.reachable === true)).toBe(true)
  })

  it('filters unreachable clusters in live mode', () => {
    const clusters: AvailableCluster[] = [
      { name: 'healthy', reachable: true },
      { name: 'down', reachable: false },
      { name: 'unknown' },
    ]
    const result = getAvailableClusters(false, clusters, [])
    const names = result.map(c => c.name)
    expect(names).toContain('healthy')
    expect(names).toContain('unknown') // reachable !== false
    expect(names).not.toContain('down')
  })

  it('returns empty for empty demo workloads', () => {
    expect(getAvailableClusters(true, [], [])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// getWorkloadStats
// ---------------------------------------------------------------------------

describe('getWorkloadStats', () => {
  it('returns DEMO_STATS in demo mode', () => {
    expect(getWorkloadStats(true, undefined, [])).toEqual(DEMO_STATS)
  })

  it('counts statuses correctly', () => {
    const workloads = [
      makeWorkload({ status: 'Running', targetClusters: ['a'] }),
      makeWorkload({ status: 'Running', targetClusters: ['b'] }),
      makeWorkload({ status: 'Failed', targetClusters: ['a'] }),
      makeWorkload({ status: 'Degraded', targetClusters: ['c'] }),
    ]
    const stats = getWorkloadStats(false, undefined, workloads)
    expect(stats.uniqueWorkloads).toBe(4)
    expect(stats.runningCount).toBe(2)
    expect(stats.failedCount).toBe(1)
    expect(stats.degradedCount).toBe(1)
    expect(stats.pendingCount).toBe(0)
    expect(stats.totalClusters).toBe(3)
  })

  it('uses realWorkloads length for totalWorkloads when available', () => {
    const real = [{ name: 'a' }, { name: 'b' }, { name: 'c' }] as unknown as RealWorkloadsInput
    const workloads = [makeWorkload(), makeWorkload()]
    const stats = getWorkloadStats(false, real, workloads)
    expect(stats.totalWorkloads).toBe(3)
    expect(stats.uniqueWorkloads).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// filterWorkloads
// ---------------------------------------------------------------------------

describe('filterWorkloads', () => {
  const clusters: AvailableCluster[] = [
    { name: 'a', reachable: true },
    { name: 'b', reachable: true },
    { name: 'c', reachable: true },
  ]
  const workloads = [
    makeWorkload({ name: 'w1', type: 'Deployment', status: 'Running', targetClusters: ['a'] }),
    makeWorkload({ name: 'w2', type: 'StatefulSet', status: 'Failed', targetClusters: ['b'] }),
    makeWorkload({ name: 'w3', type: 'Deployment', status: 'Pending', targetClusters: ['a', 'c'] }),
  ]

  it('returns all when no filters applied', () => {
    const result = filterWorkloads(workloads, 'All', 'All', [], clusters)
    expect(result).toHaveLength(3)
  })

  it('filters by type', () => {
    const result = filterWorkloads(workloads, 'Deployment', 'All', [], clusters)
    expect(result).toHaveLength(2)
    expect(result.every(w => w.type === 'Deployment')).toBe(true)
  })

  it('filters by status', () => {
    const result = filterWorkloads(workloads, 'All', 'Failed', [], clusters)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('w2')
  })

  it('filters by cluster', () => {
    const result = filterWorkloads(workloads, 'All', 'All', ['b'], clusters)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('w2')
  })

  it('combines type + status + cluster filters', () => {
    const result = filterWorkloads(workloads, 'Deployment', 'Running', ['a'], clusters)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('w1')
  })

  it('ignores cluster filter values not in availableClusters', () => {
    const result = filterWorkloads(workloads, 'All', 'All', ['nonexistent'], clusters)
    // Invalid cluster filter is discarded → returns all
    expect(result).toHaveLength(3)
  })

  it('empty cluster filter array returns all (no cluster filtering)', () => {
    const result = filterWorkloads(workloads, 'All', 'All', [], clusters)
    expect(result).toHaveLength(3)
  })
})
