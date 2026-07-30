/**
 * Unit tests for offlineDataTransforms.ts — pure data transforms for
 * the ConsoleOfflineDetectionCard.
 *
 * Covers: analyzeRootCause, buildOfflineDetectionCardLoadState,
 * buildOfflineItems, buildClusterHealthItems, buildGpuItems,
 * buildPredictionItems, generatePredictionId, buildRootCauseGroups.
 */
import { describe, it, expect } from 'vitest'
import {
  analyzeRootCause,
  buildOfflineDetectionCardLoadState,
  buildOfflineItems,
  buildClusterHealthItems,
  buildGpuItems,
  buildPredictionItems,
  generatePredictionId,
  buildRootCauseGroups,
  SORT_OPTIONS,
} from '../offlineDataTransforms'
import type {
  NodeData,
  ClusterHealthIssue,
  GpuIssue,
  UnifiedItem,
  OfflineDetectionDataSource,
} from '../offlineDataTransforms'

// ---------------------------------------------------------------------------
// SORT_OPTIONS constant
// ---------------------------------------------------------------------------

describe('SORT_OPTIONS', () => {
  it('contains severity, name, cluster, category', () => {
    const values = SORT_OPTIONS.map(o => o.value)
    expect(values).toContain('severity')
    expect(values).toContain('name')
    expect(values).toContain('cluster')
    expect(values).toContain('category')
  })
})

// ---------------------------------------------------------------------------
// analyzeRootCause
// ---------------------------------------------------------------------------

describe('analyzeRootCause', () => {
  it('returns null when no conditions present', () => {
    const node: NodeData = { name: 'n1', status: 'NotReady', roles: [] }
    expect(analyzeRootCause(node)).toBeNull()
  })

  it('returns null for empty conditions array', () => {
    const node: NodeData = { name: 'n1', status: 'NotReady', roles: [], conditions: [] }
    expect(analyzeRootCause(node)).toBeNull()
  })

  it('detects MemoryPressure', () => {
    const node: NodeData = {
      name: 'n1', status: 'NotReady', roles: [],
      conditions: [{ type: 'MemoryPressure', status: 'True', message: 'OOM' }],
    }
    const result = analyzeRootCause(node)
    expect(result).not.toBeNull()
    expect(result!.cause).toBe('Memory pressure')
    expect(result!.details).toContain('MemoryPressure')
  })

  it('detects DiskPressure', () => {
    const node: NodeData = {
      name: 'n1', status: 'NotReady', roles: [],
      conditions: [{ type: 'DiskPressure', status: 'True', reason: 'DiskFull' }],
    }
    const result = analyzeRootCause(node)
    expect(result!.cause).toBe('Disk pressure')
  })

  it('detects PIDPressure', () => {
    const node: NodeData = {
      name: 'n1', status: 'NotReady', roles: [],
      conditions: [{ type: 'PIDPressure', status: 'True' }],
    }
    expect(analyzeRootCause(node)!.cause).toBe('PID pressure')
  })

  it('detects NetworkUnavailable', () => {
    const node: NodeData = {
      name: 'n1', status: 'NotReady', roles: [],
      conditions: [{ type: 'NetworkUnavailable', status: 'True' }],
    }
    expect(analyzeRootCause(node)!.cause).toBe('Network unavailable')
  })

  it('detects Kubelet/Runtime issue from Ready condition reason', () => {
    const node: NodeData = {
      name: 'n1', status: 'NotReady', roles: [],
      conditions: [{ type: 'Ready', status: 'False', reason: 'KubeletDown', message: 'kubelet stopped' }],
    }
    const result = analyzeRootCause(node)
    expect(result!.cause).toBe('Kubelet/Runtime issue')
  })

  it('returns cordoned message when unschedulable and no problems', () => {
    const node: NodeData = {
      name: 'n1', status: 'Ready', roles: [], unschedulable: true,
      conditions: [{ type: 'Ready', status: 'True' }],
    }
    const result = analyzeRootCause(node)
    expect(result!.cause).toBe('Cordoned for maintenance')
  })

  it('ignores conditions with status False', () => {
    const node: NodeData = {
      name: 'n1', status: 'Ready', roles: [],
      conditions: [{ type: 'MemoryPressure', status: 'False' }],
    }
    expect(analyzeRootCause(node)).toBeNull()
  })

  it('does not add KubeletNotReady as a problem', () => {
    const node: NodeData = {
      name: 'n1', status: 'NotReady', roles: [],
      conditions: [{ type: 'Ready', status: 'False', reason: 'KubeletNotReady', message: 'runtime down' }],
    }
    // KubeletNotReady is excluded from problems → falls through to generic
    // But it still captures the message in details
    const result = analyzeRootCause(node)
    // No conditions matched specific checks → null (since only Ready was False with excluded reason)
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// buildOfflineDetectionCardLoadState
// ---------------------------------------------------------------------------

describe('buildOfflineDetectionCardLoadState', () => {
  it('returns loading state when source is loading with no data', () => {
    const sources: OfflineDetectionDataSource[] = [{ hasData: false, isLoading: true }]
    const state = buildOfflineDetectionCardLoadState(sources)
    expect(state.isLoading).toBe(true)
    expect(state.hasAnyData).toBe(false)
  })

  it('returns not loading when some source has data', () => {
    const sources: OfflineDetectionDataSource[] = [
      { hasData: true, isLoading: true },
    ]
    const state = buildOfflineDetectionCardLoadState(sources)
    expect(state.isLoading).toBe(false)
    expect(state.hasAnyData).toBe(true)
  })

  it('detects refreshing state', () => {
    const sources: OfflineDetectionDataSource[] = [{ hasData: true, isRefreshing: true }]
    expect(buildOfflineDetectionCardLoadState(sources).isRefreshing).toBe(true)
  })

  it('detects failed state when all sources failed and none have data', () => {
    const sources: OfflineDetectionDataSource[] = [
      { hasData: false, isFailed: true, consecutiveFailures: 3 },
      { hasData: false, isFailed: true, consecutiveFailures: 5 },
    ]
    const state = buildOfflineDetectionCardLoadState(sources)
    expect(state.isFailed).toBe(true)
    expect(state.consecutiveFailures).toBe(5) // max
  })

  it('not failed when at least one source has data', () => {
    const sources: OfflineDetectionDataSource[] = [
      { hasData: true, isFailed: false },
      { hasData: false, isFailed: true, consecutiveFailures: 3 },
    ]
    const state = buildOfflineDetectionCardLoadState(sources)
    expect(state.isFailed).toBe(false)
    expect(state.consecutiveFailures).toBe(0)
  })

  it('marks isDemoData in demo mode', () => {
    const sources: OfflineDetectionDataSource[] = [{ hasData: true }]
    expect(buildOfflineDetectionCardLoadState(sources, true).isDemoData).toBe(true)
  })

  it('marks isDemoData when source reports demo data', () => {
    const sources: OfflineDetectionDataSource[] = [{ hasData: true, isDemoData: true }]
    expect(buildOfflineDetectionCardLoadState(sources, false).isDemoData).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// buildOfflineItems
// ---------------------------------------------------------------------------

describe('buildOfflineItems', () => {
  it('returns empty array for no nodes', () => {
    expect(buildOfflineItems([])).toEqual([])
  })

  it('builds items with correct category and severity', () => {
    const nodes: NodeData[] = [
      { name: 'node-1', cluster: 'east', status: 'NotReady', roles: ['worker'] },
    ]
    const items = buildOfflineItems(nodes)
    expect(items).toHaveLength(1)
    expect(items[0].category).toBe('offline')
    expect(items[0].severity).toBe('critical')
    expect(items[0].cluster).toBe('east')
  })

  it('generates unique IDs per node', () => {
    const nodes: NodeData[] = [
      { name: 'n1', cluster: 'a', status: 'NotReady', roles: [] },
      { name: 'n2', cluster: 'b', status: 'NotReady', roles: [] },
    ]
    const items = buildOfflineItems(nodes)
    expect(items[0].id).not.toBe(items[1].id)
  })

  it('defaults cluster to unknown when missing', () => {
    const nodes: NodeData[] = [{ name: 'n1', status: 'NotReady', roles: [] }]
    expect(buildOfflineItems(nodes)[0].cluster).toBe('unknown')
  })

  it('attaches root cause analysis to item', () => {
    const nodes: NodeData[] = [{
      name: 'n1', cluster: 'a', status: 'NotReady', roles: [],
      conditions: [{ type: 'MemoryPressure', status: 'True', message: 'low' }],
    }]
    const items = buildOfflineItems(nodes)
    expect(items[0].rootCause).toBeDefined()
    expect(items[0].rootCause!.cause).toBe('Memory pressure')
  })
})

// ---------------------------------------------------------------------------
// buildClusterHealthItems
// ---------------------------------------------------------------------------

describe('buildClusterHealthItems', () => {
  it('returns empty for no issues', () => {
    expect(buildClusterHealthItems([])).toEqual([])
  })

  it('maps cluster health issues correctly', () => {
    const issues: ClusterHealthIssue[] = [{
      cluster: 'prod', state: 'unreachable', reason: 'API timeout',
      reasonDetailed: 'Cannot reach kube-apiserver', severity: 'critical',
    }]
    const items = buildClusterHealthItems(issues)
    expect(items).toHaveLength(1)
    expect(items[0].category).toBe('offline')
    expect(items[0].severity).toBe('critical')
    expect(items[0].name).toBe('prod')
    expect(items[0].rootCause!.cause).toBe('API timeout')
  })
})

// ---------------------------------------------------------------------------
// buildGpuItems
// ---------------------------------------------------------------------------

describe('buildGpuItems', () => {
  it('returns empty for no issues', () => {
    expect(buildGpuItems([])).toEqual([])
  })

  it('maps GPU issues with warning severity', () => {
    const issues: GpuIssue[] = [{
      cluster: 'gpu-cluster', nodeName: 'gpu-node-1',
      expected: 4, available: 0, reason: 'All GPUs allocated',
    }]
    const items = buildGpuItems(issues)
    expect(items).toHaveLength(1)
    expect(items[0].category).toBe('gpu')
    expect(items[0].severity).toBe('warning')
    expect(items[0].gpuData!.expected).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// buildPredictionItems
// ---------------------------------------------------------------------------

describe('buildPredictionItems', () => {
  it('returns empty for no risks', () => {
    expect(buildPredictionItems([])).toEqual([])
  })

  it('maps predicted risks correctly', () => {
    const risks = [{
      id: 'risk-1', name: 'web-pod', cluster: 'east',
      severity: 'warning' as const, reason: 'High restart rate',
      reasonDetailed: 'Pod restarted 5 times in 1h', metric: 'restarts',
      type: 'pod-crash', confidence: 0.8,
    }]
    const items = buildPredictionItems(risks as unknown)
    expect(items).toHaveLength(1)
    expect(items[0].category).toBe('prediction')
    expect(items[0].id).toBe('risk-1')
    expect(items[0].metric).toBe('restarts')
  })

  it('defaults cluster to unknown when missing', () => {
    const risks = [{
      id: 'r1', name: 'x', severity: 'info' as const,
      reason: 'test', type: 'other', confidence: 0.5,
    }]
    expect(buildPredictionItems(risks as unknown)[0].cluster).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// generatePredictionId
// ---------------------------------------------------------------------------

describe('generatePredictionId', () => {
  it('generates deterministic ID from type and name', () => {
    expect(generatePredictionId('pod-crash', 'web', 'east'))
      .toBe('heuristic-pod-crash-web-east')
  })

  it('uses unknown when cluster is not provided', () => {
    expect(generatePredictionId('resource-exhaustion', 'node'))
      .toBe('heuristic-resource-exhaustion-node-unknown')
  })
})

// ---------------------------------------------------------------------------
// buildRootCauseGroups
// ---------------------------------------------------------------------------

describe('buildRootCauseGroups', () => {
  const severityOrder = { critical: 0, warning: 1, info: 2 }

  it('returns empty for no items', () => {
    expect(buildRootCauseGroups([], severityOrder)).toEqual([])
  })

  it('groups items by root cause', () => {
    const items: UnifiedItem[] = [
      { id: '1', category: 'offline', name: 'n1', cluster: 'a', severity: 'critical', reason: 'Memory pressure', rootCause: { cause: 'Memory pressure', details: 'OOM' } },
      { id: '2', category: 'offline', name: 'n2', cluster: 'b', severity: 'critical', reason: 'Memory pressure', rootCause: { cause: 'Memory pressure', details: 'OOM' } },
      { id: '3', category: 'offline', name: 'n3', cluster: 'a', severity: 'warning', reason: 'Disk full', rootCause: { cause: 'Disk pressure', details: 'no space' } },
    ]
    const groups = buildRootCauseGroups(items, severityOrder)
    expect(groups).toHaveLength(2)
    // Largest group first
    expect(groups[0].cause).toBe('Memory pressure')
    expect(groups[0].items).toHaveLength(2)
    expect(groups[1].cause).toBe('Disk pressure')
  })

  it('groups GPU items under "GPU exhaustion"', () => {
    const items: UnifiedItem[] = [
      { id: 'g1', category: 'gpu', name: 'gpu-node', cluster: 'a', severity: 'warning', reason: 'No GPUs' },
    ]
    const groups = buildRootCauseGroups(items, severityOrder)
    expect(groups[0].cause).toBe('GPU exhaustion')
  })

  it('groups prediction items by risk type', () => {
    const items: UnifiedItem[] = [
      { id: 'p1', category: 'prediction', name: 'pod-x', cluster: 'a', severity: 'warning', reason: 'crash risk',
        predictionData: { id: 'p1', name: 'pod-x', type: 'pod-crash', severity: 'warning', reason: 'high restarts', confidence: 0.9 } as unknown },
    ]
    const groups = buildRootCauseGroups(items, severityOrder)
    expect(groups[0].cause).toBe('Pod crash risk')
  })

  it('groups resource-exhaustion predictions by metric', () => {
    const items: UnifiedItem[] = [
      { id: 'r1', category: 'prediction', name: 'cluster-x', cluster: 'a', severity: 'warning', reason: 'cpu high',
        predictionData: { id: 'r1', name: 'cluster-x', type: 'resource-exhaustion', metric: 'cpu', severity: 'warning', reason: 'cpu high', confidence: 0.8 } as unknown },
    ]
    const groups = buildRootCauseGroups(items, severityOrder)
    expect(groups[0].cause).toBe('CPU pressure')
  })

  it('promotes group severity to critical if any item is critical', () => {
    const items: UnifiedItem[] = [
      { id: '1', category: 'offline', name: 'n1', cluster: 'a', severity: 'warning', reason: 'x', rootCause: { cause: 'Issue', details: 'd' } },
      { id: '2', category: 'offline', name: 'n2', cluster: 'b', severity: 'critical', reason: 'x', rootCause: { cause: 'Issue', details: 'd' } },
    ]
    const groups = buildRootCauseGroups(items, severityOrder)
    expect(groups[0].severity).toBe('critical')
  })

  it('tracks categories in group', () => {
    const items: UnifiedItem[] = [
      { id: '1', category: 'offline', name: 'n1', cluster: 'a', severity: 'critical', reason: 'x', rootCause: { cause: 'Shared', details: 'd' } },
      { id: '2', category: 'gpu', name: 'n2', cluster: 'a', severity: 'warning', reason: 'y', rootCause: { cause: 'Shared', details: 'd' } },
    ]
    const groups = buildRootCauseGroups(items, severityOrder)
    expect(groups[0].categories.has('offline')).toBe(true)
    expect(groups[0].categories.has('gpu')).toBe(true)
  })

  it('sorts by item count descending, then severity ascending', () => {
    const items: UnifiedItem[] = [
      { id: '1', category: 'offline', name: 'n1', cluster: 'a', severity: 'info', reason: 'minor', rootCause: { cause: 'Minor', details: '' } },
      { id: '2', category: 'offline', name: 'n2', cluster: 'a', severity: 'critical', reason: 'big', rootCause: { cause: 'Big', details: '' } },
      { id: '3', category: 'offline', name: 'n3', cluster: 'b', severity: 'critical', reason: 'big', rootCause: { cause: 'Big', details: '' } },
    ]
    const groups = buildRootCauseGroups(items, severityOrder)
    expect(groups[0].cause).toBe('Big') // 2 items
    expect(groups[1].cause).toBe('Minor') // 1 item
  })
})
