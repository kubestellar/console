/**
 * Unit tests for NamespaceMonitor.utils pure functions.
 *
 * Covers: getFilteredClusters, buildCurrentSnapshots, detectResourceChanges,
 * buildNamespaceData, getResourceChange, getChangeCountsByType, and the
 * exported registry/constant maps.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ClusterInfo } from '../../hooks/useMCP'
import { MS_PER_MINUTE } from '../../lib/constants/time'
import {
  buildCurrentSnapshots,
  buildNamespaceData,
  ChangeAnimations,
  detectResourceChanges,
  EMPTY_NAMESPACE_DATA,
  getChangeCountsByType,
  getFilteredClusters,
  getResourceChange,
  MAX_NAMESPACES_RENDERED_PER_CLUSTER,
  MAX_RECENT_CHANGES,
  MAX_VISIBLE_CHANGES,
  MAX_VISIBLE_ITEMS,
  RECENT_CHANGE_WINDOW_MS,
  ResourceColors,
  ResourceIcons,
} from './NamespaceMonitor.utils'
import type {
  ConfigMapItem,
  DeploymentItem,
  JobItem,
  PVCItem,
  PodItem,
  ResourceChange,
  ResourceSnapshot,
  SecretItem,
  ServiceItem,
} from './NamespaceMonitor.types'

const cluster = (name: string, extras: Partial<ClusterInfo> = {}): ClusterInfo => ({
  name,
  context: name,
  ...extras,
})

// ---------------------------------------------------------------------------
// Constants & registries
// ---------------------------------------------------------------------------

describe('exported constants', () => {
  it('exposes the 7 resource icons and colors', () => {
    const types = ['pods', 'deployments', 'services', 'configmaps', 'secrets', 'pvcs', 'jobs'] as const
    types.forEach(t => {
      expect(ResourceIcons[t]).toBeDefined()
      expect(typeof ResourceColors[t]).toBe('string')
    })
  })

  it('exposes animation classes for every non-null change type', () => {
    expect(Object.keys(ChangeAnimations).sort()).toEqual(['added', 'deleted', 'error', 'modified'])
    Object.values(ChangeAnimations).forEach(cls => expect(cls).toMatch(/animate-pulse/))
  })

  it('freezes render/window caps at documented values', () => {
    expect(MAX_NAMESPACES_RENDERED_PER_CLUSTER).toBe(30)
    expect(MAX_VISIBLE_ITEMS).toBe(10)
    expect(MAX_RECENT_CHANGES).toBe(50)
    expect(MAX_VISIBLE_CHANGES).toBe(20)
    expect(RECENT_CHANGE_WINDOW_MS).toBe(5000)
  })

  it('exposes an empty namespace-data map', () => {
    expect(EMPTY_NAMESPACE_DATA).toBeInstanceOf(Map)
    expect(EMPTY_NAMESPACE_DATA.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// getFilteredClusters
// ---------------------------------------------------------------------------

describe('getFilteredClusters', () => {
  const a = cluster('alpha', { reachable: true })
  const b = cluster('beta', { reachable: true })
  const c = cluster('gamma', { reachable: false })

  it('drops unreachable clusters', () => {
    const out = getFilteredClusters({
      clusters: [a, b, c],
      selectedClusters: [],
      isAllClustersSelected: true,
      searchFilter: '',
    })
    expect(out.map(x => x.name)).toEqual(['alpha', 'beta'])
  })

  it('restricts to selected clusters when not all-selected', () => {
    const out = getFilteredClusters({
      clusters: [a, b],
      selectedClusters: ['beta'],
      isAllClustersSelected: false,
      searchFilter: '',
    })
    expect(out.map(x => x.name)).toEqual(['beta'])
  })

  it('filters by case-insensitive name substring', () => {
    const out = getFilteredClusters({
      clusters: [a, b],
      selectedClusters: [],
      isAllClustersSelected: true,
      searchFilter: 'AL',
    })
    expect(out.map(x => x.name)).toEqual(['alpha'])
  })

  it('treats reachable undefined as reachable (only false is excluded)', () => {
    const d = cluster('delta') // reachable undefined
    const out = getFilteredClusters({
      clusters: [d, c],
      selectedClusters: [],
      isAllClustersSelected: true,
      searchFilter: '',
    })
    expect(out.map(x => x.name)).toEqual(['delta'])
  })

  it('handles null/undefined clusters input without throwing', () => {
    expect(
      getFilteredClusters({
        clusters: undefined as unknown as ClusterInfo[],
        selectedClusters: [],
        isAllClustersSelected: true,
        searchFilter: '',
      }),
    ).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// buildCurrentSnapshots
// ---------------------------------------------------------------------------

describe('buildCurrentSnapshots', () => {
  it('produces one snapshot per resource with cluster-scoped keys', () => {
    const pods: PodItem[] = [{ name: 'p1', namespace: 'ns', status: 'Running', restarts: 0 }]
    const deployments: DeploymentItem[] = [
      { name: 'd1', namespace: 'ns', replicas: 3, readyReplicas: 2, status: 'Progressing' },
    ]
    const services: ServiceItem[] = [{ name: 's1', namespace: 'ns', type: 'ClusterIP' }]
    const pvcs: PVCItem[] = [{ name: 'v1', namespace: 'ns', status: 'Bound' }]
    const configmaps: ConfigMapItem[] = [{ name: 'c1', namespace: 'ns' }]
    const secrets: SecretItem[] = [{ name: 'k1', namespace: 'ns' }]
    const jobs: JobItem[] = [{ name: 'j1', namespace: 'ns', status: 'Complete' }]

    const snaps = buildCurrentSnapshots({
      selectedCluster: 'c1',
      pods,
      deployments,
      services,
      pvcs,
      configmaps,
      secrets,
      jobs,
    })

    expect(snaps.size).toBe(7)
    const pod = snaps.get('c1:ns:pod:p1')!
    expect(pod.status).toBe('Running')
    expect(pod.cluster).toBe('c1')

    const dep = snaps.get('c1:ns:deployment:d1')!
    expect(dep.replicas).toBe(3)
    expect(dep.readyReplicas).toBe(2)

    expect(snaps.get('c1:ns:service:s1')).toBeDefined()
    expect(snaps.get('c1:ns:pvc:v1')?.status).toBe('Bound')
    expect(snaps.get('c1:ns:configmap:c1')).toBeDefined()
    expect(snaps.get('c1:ns:secret:k1')).toBeDefined()
    expect(snaps.get('c1:ns:job:j1')?.status).toBe('Complete')
  })

  it('returns empty map when all inputs are omitted', () => {
    const snaps = buildCurrentSnapshots({ selectedCluster: 'c1' })
    expect(snaps.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// detectResourceChanges
// ---------------------------------------------------------------------------

describe('detectResourceChanges', () => {
  const key = (t: string, n: string) => `c1:ns:${t}:${n}`

  it('emits added events for snapshots absent from the previous set', () => {
    const current = new Map<string, ResourceSnapshot>([
      [key('pod', 'p1'), { key: key('pod', 'p1'), name: 'p1', namespace: 'ns', cluster: 'c1' }],
    ])
    const changes = detectResourceChanges(current, new Map())
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ type: 'added', resourceType: 'pod', name: 'p1' })
  })

  it('emits deleted events for snapshots missing from the current set', () => {
    const previous = new Map<string, ResourceSnapshot>([
      [key('pod', 'gone'), { key: key('pod', 'gone'), name: 'gone', namespace: 'ns', cluster: 'c1' }],
    ])
    const changes = detectResourceChanges(new Map(), previous)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ type: 'deleted', name: 'gone' })
  })

  it('emits modified events when status changes', () => {
    const k = key('pod', 'p1')
    const current = new Map([[k, { key: k, name: 'p1', namespace: 'ns', cluster: 'c1', status: 'Pending' }]])
    const previous = new Map([[k, { key: k, name: 'p1', namespace: 'ns', cluster: 'c1', status: 'Running' }]])
    const changes = detectResourceChanges(current, previous)
    expect(changes).toHaveLength(1)
    expect(changes[0].type).toBe('modified')
    expect(changes[0].details).toContain('Running')
    expect(changes[0].details).toContain('Pending')
  })

  it('classifies CrashLoopBackOff, Error, and Failed as error type', () => {
    const errStatuses = ['CrashLoopBackOff', 'Error', 'Failed']
    errStatuses.forEach(status => {
      const k = key('pod', status)
      const current = new Map([[k, { key: k, name: status, namespace: 'ns', cluster: 'c1', status }]])
      const previous = new Map([[k, { key: k, name: status, namespace: 'ns', cluster: 'c1', status: 'Running' }]])
      const changes = detectResourceChanges(current, previous)
      expect(changes[0].type).toBe('error')
    })
  })

  it('flags a deployment as error when readyReplicas < replicas', () => {
    const k = key('deployment', 'd1')
    const current = new Map([
      [k, { key: k, name: 'd1', namespace: 'ns', cluster: 'c1', status: 'Ready', replicas: 3, readyReplicas: 1 }],
    ])
    const previous = new Map([
      [k, { key: k, name: 'd1', namespace: 'ns', cluster: 'c1', status: 'Ready', replicas: 3, readyReplicas: 3 }],
    ])
    const changes = detectResourceChanges(current, previous)
    expect(changes).toHaveLength(1)
    expect(changes[0].type).toBe('error')
  })

  it('emits nothing when snapshots are identical', () => {
    const k = key('pod', 'p1')
    const snap = { key: k, name: 'p1', namespace: 'ns', cluster: 'c1', status: 'Running' }
    const current = new Map([[k, snap]])
    const previous = new Map([[k, { ...snap }]])
    expect(detectResourceChanges(current, previous)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// buildNamespaceData
// ---------------------------------------------------------------------------

describe('buildNamespaceData', () => {
  it('returns an empty map when no cluster is selected', () => {
    const out = buildNamespaceData({ selectedCluster: null, searchFilter: '' })
    expect(out.size).toBe(0)
  })

  it('groups resources by namespace and flags issues', () => {
    const pods: PodItem[] = [
      { name: 'p1', namespace: 'app', status: 'Running', restarts: 0 },
      { name: 'p2', namespace: 'app', status: 'CrashLoopBackOff', restarts: 4 },
      { name: 'p3', namespace: 'infra', status: 'Running', restarts: 0 },
    ]
    const deployments: DeploymentItem[] = [
      { name: 'd1', namespace: 'infra', replicas: 3, readyReplicas: 3 },
    ]

    const out = buildNamespaceData({
      selectedCluster: 'c1',
      namespaces: ['app', 'infra'],
      pods,
      deployments,
      searchFilter: '',
    })

    expect(out.get('app')?.pods).toHaveLength(2)
    expect(out.get('app')?.hasIssues).toBe(true)
    expect(out.get('infra')?.pods).toHaveLength(1)
    expect(out.get('infra')?.hasIssues).toBe(false)
  })

  it('flags issues when a deployment has fewer ready replicas than desired', () => {
    const deployments: DeploymentItem[] = [
      { name: 'd1', namespace: 'app', replicas: 3, readyReplicas: 1 },
    ]
    const out = buildNamespaceData({
      selectedCluster: 'c1',
      namespaces: ['app'],
      deployments,
      searchFilter: '',
    })
    expect(out.get('app')?.hasIssues).toBe(true)
  })

  it('treats Succeeded pods as healthy', () => {
    const pods: PodItem[] = [{ name: 'p1', namespace: 'batch', status: 'Succeeded', restarts: 0 }]
    const out = buildNamespaceData({
      selectedCluster: 'c1',
      namespaces: ['batch'],
      pods,
      searchFilter: '',
    })
    expect(out.get('batch')?.hasIssues).toBe(false)
  })

  it('applies the case-insensitive namespace search filter', () => {
    const out = buildNamespaceData({
      selectedCluster: 'c1',
      namespaces: ['kube-system', 'default', 'my-app'],
      searchFilter: 'KUBE',
    })
    expect([...out.keys()]).toEqual(['kube-system'])
  })

  it('emits empty resource arrays for namespaces with no resources', () => {
    const out = buildNamespaceData({
      selectedCluster: 'c1',
      namespaces: ['empty'],
      searchFilter: '',
    })
    const data = out.get('empty')!
    expect(data.pods).toEqual([])
    expect(data.deployments).toEqual([])
    expect(data.services).toEqual([])
    expect(data.configmaps).toEqual([])
    expect(data.secrets).toEqual([])
    expect(data.pvcs).toEqual([])
    expect(data.jobs).toEqual([])
    expect(data.hasIssues).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getResourceChange
// ---------------------------------------------------------------------------

describe('getResourceChange', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  const mkChange = (over: Partial<ResourceChange> = {}): ResourceChange => ({
    type: 'added',
    timestamp: Date.now(),
    resourceType: 'pods',
    name: 'p1',
    namespace: 'ns',
    cluster: 'c1',
    ...over,
  })

  it('returns the change type when a matching recent change exists', () => {
    const changes = [mkChange({ type: 'modified' })]
    expect(getResourceChange(changes, 'c1', 'ns', 'pods', 'p1')).toBe('modified')
  })

  it('returns null when no match is found', () => {
    const changes = [mkChange()]
    expect(getResourceChange(changes, 'c1', 'ns', 'pods', 'other')).toBeNull()
  })

  it('returns null when the matching change is older than the window', () => {
    const changes = [mkChange({ timestamp: Date.now() - RECENT_CHANGE_WINDOW_MS - 1 })]
    expect(getResourceChange(changes, 'c1', 'ns', 'pods', 'p1')).toBeNull()
  })

  it('tolerates undefined recentChanges input', () => {
    expect(
      getResourceChange(undefined as unknown as ResourceChange[], 'c1', 'ns', 'pods', 'p1'),
    ).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getChangeCountsByType
// ---------------------------------------------------------------------------

describe('getChangeCountsByType', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  const now = () => Date.now()

  it('counts recent changes by type', () => {
    const changes: ResourceChange[] = [
      { type: 'added', timestamp: now(), resourceType: 'pods', name: 'a', namespace: 'ns', cluster: 'c1' },
      { type: 'added', timestamp: now(), resourceType: 'pods', name: 'b', namespace: 'ns', cluster: 'c1' },
      { type: 'modified', timestamp: now(), resourceType: 'pods', name: 'c', namespace: 'ns', cluster: 'c1' },
      { type: 'error', timestamp: now(), resourceType: 'pods', name: 'd', namespace: 'ns', cluster: 'c1' },
      { type: 'deleted', timestamp: now(), resourceType: 'pods', name: 'e', namespace: 'ns', cluster: 'c1' },
    ]
    expect(getChangeCountsByType(changes)).toEqual({ added: 2, modified: 1, deleted: 1, error: 1 })
  })

  it('ignores changes older than one minute', () => {
    const stale: ResourceChange = {
      type: 'added',
      timestamp: now() - MS_PER_MINUTE - 1,
      resourceType: 'pods',
      name: 'old',
      namespace: 'ns',
      cluster: 'c1',
    }
    const fresh: ResourceChange = { ...stale, name: 'new', timestamp: now() }
    expect(getChangeCountsByType([stale, fresh])).toEqual({ added: 1, modified: 0, deleted: 0, error: 0 })
  })

  it('ignores entries whose type is null', () => {
    const changes: ResourceChange[] = [
      { type: null, timestamp: now(), resourceType: 'pods', name: 'x', namespace: 'ns', cluster: 'c1' },
    ]
    expect(getChangeCountsByType(changes)).toEqual({ added: 0, modified: 0, deleted: 0, error: 0 })
  })

  it('tolerates undefined input', () => {
    expect(getChangeCountsByType(undefined as unknown as ResourceChange[])).toEqual({
      added: 0,
      modified: 0,
      deleted: 0,
      error: 0,
    })
  })
})
