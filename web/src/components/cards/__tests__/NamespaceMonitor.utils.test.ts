import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { ClusterInfo } from '@/hooks/useMCP'
import type {
  PodItem,
  DeploymentItem,
  ServiceItem,
  ConfigMapItem,
  SecretItem,
  PVCItem,
  JobItem,
  ResourceChange,
  ResourceSnapshot,
} from '../NamespaceMonitor.types'
import {
  getFilteredClusters,
  buildCurrentSnapshots,
  detectResourceChanges,
  buildNamespaceData,
  getResourceChange,
  getChangeCountsByType,
  ResourceIcons,
  ResourceColors,
  ChangeAnimations,
  MAX_NAMESPACES_RENDERED_PER_CLUSTER,
  RECENT_CHANGE_WINDOW_MS,
  EMPTY_NAMESPACE_DATA,
} from '../NamespaceMonitor.utils'

// ─── Constants ───────────────────────────────────────────────────────────────

describe('NamespaceMonitor constants', () => {
  it('ResourceIcons has all 7 resource types', () => {
    expect(Object.keys(ResourceIcons)).toEqual(
      expect.arrayContaining(['pods', 'deployments', 'services', 'configmaps', 'secrets', 'pvcs', 'jobs']),
    )
    expect(Object.keys(ResourceIcons)).toHaveLength(7)
  })

  it('ResourceColors has all 7 resource types', () => {
    expect(Object.keys(ResourceColors)).toHaveLength(7)
    expect(ResourceColors.pods).toContain('cyan')
    expect(ResourceColors.secrets).toContain('red')
  })

  it('ChangeAnimations covers added, modified, deleted, error', () => {
    expect(ChangeAnimations.added).toContain('green')
    expect(ChangeAnimations.modified).toContain('yellow')
    expect(ChangeAnimations.deleted).toContain('red')
    expect(ChangeAnimations.error).toContain('red')
  })

  it('MAX_NAMESPACES_RENDERED_PER_CLUSTER is 30', () => {
    expect(MAX_NAMESPACES_RENDERED_PER_CLUSTER).toBe(30)
  })

  it('RECENT_CHANGE_WINDOW_MS is 5000', () => {
    expect(RECENT_CHANGE_WINDOW_MS).toBe(5000)
  })

  it('EMPTY_NAMESPACE_DATA is an empty Map', () => {
    expect(EMPTY_NAMESPACE_DATA.size).toBe(0)
  })
})

// ─── getFilteredClusters ─────────────────────────────────────────────────────

describe('getFilteredClusters', () => {
  const clusters: ClusterInfo[] = [
    { name: 'prod-us-east', context: 'prod-us-east', reachable: true },
    { name: 'prod-eu-west', context: 'prod-eu-west', reachable: true },
    { name: 'staging', context: 'staging', reachable: false },
    { name: 'dev-local', context: 'dev-local', reachable: true },
  ]

  it('filters out unreachable clusters', () => {
    const result = getFilteredClusters({
      clusters,
      selectedClusters: [],
      isAllClustersSelected: true,
      searchFilter: '',
    })
    expect(result).toHaveLength(3)
    expect(result.map((c) => c.name)).not.toContain('staging')
  })

  it('filters by selectedClusters when not all selected', () => {
    const result = getFilteredClusters({
      clusters,
      selectedClusters: ['prod-us-east'],
      isAllClustersSelected: false,
      searchFilter: '',
    })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('prod-us-east')
  })

  it('applies search filter (case-insensitive)', () => {
    const result = getFilteredClusters({
      clusters,
      selectedClusters: [],
      isAllClustersSelected: true,
      searchFilter: 'PROD',
    })
    expect(result).toHaveLength(2)
  })

  it('returns empty array for null/undefined clusters', () => {
    const result = getFilteredClusters({
      clusters: undefined as unknown as ClusterInfo[],
      selectedClusters: [],
      isAllClustersSelected: true,
      searchFilter: '',
    })
    expect(result).toEqual([])
  })

  it('combined: selection + search filter', () => {
    const result = getFilteredClusters({
      clusters,
      selectedClusters: ['prod-us-east', 'prod-eu-west', 'dev-local'],
      isAllClustersSelected: false,
      searchFilter: 'eu',
    })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('prod-eu-west')
  })
})

// ─── buildCurrentSnapshots ───────────────────────────────────────────────────

describe('buildCurrentSnapshots', () => {
  it('builds pod snapshots with correct keys', () => {
    const pods: PodItem[] = [{ name: 'nginx-abc', namespace: 'default', status: 'Running', restarts: 0 }]
    const result = buildCurrentSnapshots({ selectedCluster: 'cluster-1', pods })
    expect(result.size).toBe(1)
    const snap = result.get('cluster-1:default:pod:nginx-abc')
    expect(snap).toEqual({
      key: 'cluster-1:default:pod:nginx-abc',
      name: 'nginx-abc',
      namespace: 'default',
      cluster: 'cluster-1',
      status: 'Running',
    })
  })

  it('builds deployment snapshots with replicas', () => {
    const deployments: DeploymentItem[] = [
      { name: 'api', namespace: 'prod', replicas: 3, readyReplicas: 2, status: 'Available' },
    ]
    const result = buildCurrentSnapshots({ selectedCluster: 'c1', deployments })
    const snap = result.get('c1:prod:deployment:api')
    expect(snap?.replicas).toBe(3)
    expect(snap?.readyReplicas).toBe(2)
  })

  it('builds service, pvc, configmap, secret, job snapshots', () => {
    const services: ServiceItem[] = [{ name: 'svc-1', namespace: 'ns', type: 'ClusterIP' }]
    const pvcs: PVCItem[] = [{ name: 'data-vol', namespace: 'ns', status: 'Bound' }]
    const configmaps: ConfigMapItem[] = [{ name: 'app-config', namespace: 'ns' }]
    const secrets: SecretItem[] = [{ name: 'tls-cert', namespace: 'ns' }]
    const jobs: JobItem[] = [{ name: 'migrate', namespace: 'ns', status: 'Complete' }]

    const result = buildCurrentSnapshots({
      selectedCluster: 'c2',
      services,
      pvcs,
      configmaps,
      secrets,
      jobs,
    })
    expect(result.size).toBe(5)
    expect(result.has('c2:ns:service:svc-1')).toBe(true)
    expect(result.has('c2:ns:pvc:data-vol')).toBe(true)
    expect(result.has('c2:ns:configmap:app-config')).toBe(true)
    expect(result.has('c2:ns:secret:tls-cert')).toBe(true)
    expect(result.has('c2:ns:job:migrate')).toBe(true)
  })

  it('handles undefined resource arrays', () => {
    const result = buildCurrentSnapshots({ selectedCluster: 'c1' })
    expect(result.size).toBe(0)
  })

  it('handles multiple items in same namespace', () => {
    const pods: PodItem[] = [
      { name: 'pod-a', namespace: 'ns', status: 'Running', restarts: 0 },
      { name: 'pod-b', namespace: 'ns', status: 'Pending', restarts: 0 },
    ]
    const result = buildCurrentSnapshots({ selectedCluster: 'c1', pods })
    expect(result.size).toBe(2)
  })
})

// ─── detectResourceChanges ───────────────────────────────────────────────────

describe('detectResourceChanges', () => {
  it('detects added resources', () => {
    const prev = new Map<string, ResourceSnapshot>()
    const curr = new Map<string, ResourceSnapshot>([
      ['c1:ns:pod:new-pod', { key: 'c1:ns:pod:new-pod', name: 'new-pod', namespace: 'ns', cluster: 'c1', status: 'Running' }],
    ])
    const changes = detectResourceChanges(curr, prev)
    expect(changes).toHaveLength(1)
    expect(changes[0].type).toBe('added')
    expect(changes[0].name).toBe('new-pod')
    expect(changes[0].details).toBe('New resource created')
  })

  it('detects deleted resources', () => {
    const prev = new Map<string, ResourceSnapshot>([
      ['c1:ns:pod:old', { key: 'c1:ns:pod:old', name: 'old', namespace: 'ns', cluster: 'c1', status: 'Running' }],
    ])
    const curr = new Map<string, ResourceSnapshot>()
    const changes = detectResourceChanges(curr, prev)
    expect(changes).toHaveLength(1)
    expect(changes[0].type).toBe('deleted')
    expect(changes[0].details).toBe('Resource deleted')
  })

  it('detects modified resources (status change)', () => {
    const prev = new Map<string, ResourceSnapshot>([
      ['c1:ns:pod:app', { key: 'c1:ns:pod:app', name: 'app', namespace: 'ns', cluster: 'c1', status: 'Pending' }],
    ])
    const curr = new Map<string, ResourceSnapshot>([
      ['c1:ns:pod:app', { key: 'c1:ns:pod:app', name: 'app', namespace: 'ns', cluster: 'c1', status: 'Running' }],
    ])
    const changes = detectResourceChanges(curr, prev)
    expect(changes).toHaveLength(1)
    expect(changes[0].type).toBe('modified')
    expect(changes[0].details).toBe('Status: Pending → Running')
  })

  it('detects error state (CrashLoopBackOff)', () => {
    const prev = new Map<string, ResourceSnapshot>([
      ['c1:ns:pod:crash', { key: 'c1:ns:pod:crash', name: 'crash', namespace: 'ns', cluster: 'c1', status: 'Running' }],
    ])
    const curr = new Map<string, ResourceSnapshot>([
      ['c1:ns:pod:crash', { key: 'c1:ns:pod:crash', name: 'crash', namespace: 'ns', cluster: 'c1', status: 'CrashLoopBackOff' }],
    ])
    const changes = detectResourceChanges(curr, prev)
    expect(changes[0].type).toBe('error')
  })

  it('detects error state (readyReplicas < replicas)', () => {
    const prev = new Map<string, ResourceSnapshot>([
      ['c1:ns:deployment:api', { key: 'c1:ns:deployment:api', name: 'api', namespace: 'ns', cluster: 'c1', status: 'Available', replicas: 3, readyReplicas: 3 }],
    ])
    const curr = new Map<string, ResourceSnapshot>([
      ['c1:ns:deployment:api', { key: 'c1:ns:deployment:api', name: 'api', namespace: 'ns', cluster: 'c1', status: 'Available', replicas: 3, readyReplicas: 1 }],
    ])
    const changes = detectResourceChanges(curr, prev)
    expect(changes[0].type).toBe('error')
  })

  it('no changes when snapshots are identical', () => {
    const snap = new Map<string, ResourceSnapshot>([
      ['c1:ns:pod:stable', { key: 'c1:ns:pod:stable', name: 'stable', namespace: 'ns', cluster: 'c1', status: 'Running' }],
    ])
    const changes = detectResourceChanges(snap, snap)
    expect(changes).toHaveLength(0)
  })

  it('detects multiple changes simultaneously', () => {
    const prev = new Map<string, ResourceSnapshot>([
      ['c1:ns:pod:a', { key: 'c1:ns:pod:a', name: 'a', namespace: 'ns', cluster: 'c1', status: 'Running' }],
      ['c1:ns:pod:b', { key: 'c1:ns:pod:b', name: 'b', namespace: 'ns', cluster: 'c1', status: 'Running' }],
    ])
    const curr = new Map<string, ResourceSnapshot>([
      ['c1:ns:pod:a', { key: 'c1:ns:pod:a', name: 'a', namespace: 'ns', cluster: 'c1', status: 'Failed' }],
      ['c1:ns:pod:c', { key: 'c1:ns:pod:c', name: 'c', namespace: 'ns', cluster: 'c1', status: 'Running' }],
    ])
    const changes = detectResourceChanges(curr, prev)
    // a changed to Failed (error), b deleted, c added
    expect(changes).toHaveLength(3)
    const types = changes.map(c => c.type)
    expect(types).toContain('error')
    expect(types).toContain('deleted')
    expect(types).toContain('added')
  })
})

// ─── buildNamespaceData ──────────────────────────────────────────────────────

describe('buildNamespaceData', () => {
  it('returns empty map when selectedCluster is null', () => {
    const result = buildNamespaceData({
      selectedCluster: null,
      namespaces: ['default'],
      searchFilter: '',
    })
    expect(result.size).toBe(0)
  })

  it('groups resources by namespace', () => {
    const pods: PodItem[] = [
      { name: 'pod-1', namespace: 'default', status: 'Running', restarts: 0 },
      { name: 'pod-2', namespace: 'kube-system', status: 'Running', restarts: 0 },
    ]
    const result = buildNamespaceData({
      selectedCluster: 'c1',
      namespaces: ['default', 'kube-system'],
      pods,
      searchFilter: '',
    })
    expect(result.size).toBe(2)
    expect(result.get('default')?.pods).toHaveLength(1)
    expect(result.get('kube-system')?.pods).toHaveLength(1)
  })

  it('filters namespaces by search query (case-insensitive)', () => {
    const result = buildNamespaceData({
      selectedCluster: 'c1',
      namespaces: ['default', 'kube-system', 'monitoring'],
      searchFilter: 'KUBE',
    })
    expect(result.size).toBe(1)
    expect(result.has('kube-system')).toBe(true)
  })

  it('sets hasIssues when pod is not Running/Succeeded', () => {
    const pods: PodItem[] = [{ name: 'bad', namespace: 'ns', status: 'CrashLoopBackOff', restarts: 5 }]
    const result = buildNamespaceData({
      selectedCluster: 'c1',
      namespaces: ['ns'],
      pods,
      searchFilter: '',
    })
    expect(result.get('ns')?.hasIssues).toBe(true)
  })

  it('sets hasIssues when deployment readyReplicas < replicas', () => {
    const deployments: DeploymentItem[] = [
      { name: 'api', namespace: 'ns', replicas: 3, readyReplicas: 1 },
    ]
    const result = buildNamespaceData({
      selectedCluster: 'c1',
      namespaces: ['ns'],
      deployments,
      searchFilter: '',
    })
    expect(result.get('ns')?.hasIssues).toBe(true)
  })

  it('hasIssues is false when all pods are Running', () => {
    const pods: PodItem[] = [{ name: 'ok', namespace: 'ns', status: 'Running', restarts: 0 }]
    const deployments: DeploymentItem[] = [
      { name: 'api', namespace: 'ns', replicas: 2, readyReplicas: 2 },
    ]
    const result = buildNamespaceData({
      selectedCluster: 'c1',
      namespaces: ['ns'],
      pods,
      deployments,
      searchFilter: '',
    })
    expect(result.get('ns')?.hasIssues).toBe(false)
  })

  it('handles undefined resource arrays gracefully', () => {
    const result = buildNamespaceData({
      selectedCluster: 'c1',
      namespaces: ['ns'],
      searchFilter: '',
    })
    expect(result.get('ns')?.pods).toEqual([])
    expect(result.get('ns')?.services).toEqual([])
  })
})

// ─── getResourceChange ───────────────────────────────────────────────────────

describe('getResourceChange', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(10000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns change type when within window', () => {
    const changes: ResourceChange[] = [
      { type: 'added', timestamp: 9000, resourceType: 'pods', name: 'pod-1', namespace: 'ns', cluster: 'c1' },
    ]
    const result = getResourceChange(changes, 'c1', 'ns', 'pods', 'pod-1')
    expect(result).toBe('added')
  })

  it('returns null when change is outside window', () => {
    const changes: ResourceChange[] = [
      { type: 'added', timestamp: 1000, resourceType: 'pods', name: 'pod-1', namespace: 'ns', cluster: 'c1' },
    ]
    const result = getResourceChange(changes, 'c1', 'ns', 'pods', 'pod-1')
    expect(result).toBeNull()
  })

  it('returns null when no matching change found', () => {
    const changes: ResourceChange[] = [
      { type: 'modified', timestamp: 9500, resourceType: 'services', name: 'svc', namespace: 'ns', cluster: 'c1' },
    ]
    const result = getResourceChange(changes, 'c1', 'ns', 'pods', 'pod-1')
    expect(result).toBeNull()
  })

  it('handles null/undefined recentChanges', () => {
    const result = getResourceChange(undefined as unknown as ResourceChange[], 'c1', 'ns', 'pods', 'pod-1')
    expect(result).toBeNull()
  })

  it('matches on all fields: cluster, namespace, type, name', () => {
    const changes: ResourceChange[] = [
      { type: 'deleted', timestamp: 9500, resourceType: 'pods', name: 'pod-1', namespace: 'other', cluster: 'c1' },
      { type: 'modified', timestamp: 9500, resourceType: 'pods', name: 'pod-1', namespace: 'ns', cluster: 'c2' },
      { type: 'error', timestamp: 9500, resourceType: 'pods', name: 'pod-1', namespace: 'ns', cluster: 'c1' },
    ]
    const result = getResourceChange(changes, 'c1', 'ns', 'pods', 'pod-1')
    expect(result).toBe('error')
  })
})

// ─── getChangeCountsByType ───────────────────────────────────────────────────

describe('getChangeCountsByType', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(120000) // 2 minutes
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts changes within last minute', () => {
    const changes: ResourceChange[] = [
      { type: 'added', timestamp: 65000, resourceType: 'pods', name: 'a', namespace: 'ns', cluster: 'c1' },
      { type: 'added', timestamp: 70000, resourceType: 'pods', name: 'b', namespace: 'ns', cluster: 'c1' },
      { type: 'modified', timestamp: 80000, resourceType: 'pods', name: 'c', namespace: 'ns', cluster: 'c1' },
      { type: 'deleted', timestamp: 90000, resourceType: 'pods', name: 'd', namespace: 'ns', cluster: 'c1' },
      { type: 'error', timestamp: 100000, resourceType: 'pods', name: 'e', namespace: 'ns', cluster: 'c1' },
    ]
    const result = getChangeCountsByType(changes)
    expect(result).toEqual({ added: 2, modified: 1, deleted: 1, error: 1 })
  })

  it('excludes changes older than 1 minute', () => {
    const changes: ResourceChange[] = [
      { type: 'added', timestamp: 50000, resourceType: 'pods', name: 'old', namespace: 'ns', cluster: 'c1' },
    ]
    const result = getChangeCountsByType(changes)
    expect(result).toEqual({ added: 0, modified: 0, deleted: 0, error: 0 })
  })

  it('returns zeros for empty array', () => {
    const result = getChangeCountsByType([])
    expect(result).toEqual({ added: 0, modified: 0, deleted: 0, error: 0 })
  })

  it('handles null/undefined input', () => {
    const result = getChangeCountsByType(undefined as unknown as ResourceChange[])
    expect(result).toEqual({ added: 0, modified: 0, deleted: 0, error: 0 })
  })
})
