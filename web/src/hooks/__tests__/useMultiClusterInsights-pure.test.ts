import { describe, it, expect } from 'vitest'
import { __testables } from '../useMultiClusterInsights'
import type { ClusterEvent } from '../mcp/types'

const {
  workloadPrefix,
  isCausallyRelated,
  getDemoInsights,
  REASON_FAMILIES,
  REASON_TO_FAMILY,
  SEVERITY_RANK,
  MAX_TOP_INSIGHTS,
  RESOURCE_IMBALANCE_THRESHOLD_PCT,
  DELTA_SIGNIFICANCE_HIGH_PCT,
  DELTA_SIGNIFICANCE_MEDIUM_PCT,
  INFRA_ISSUE_MIN_WORKLOADS,
  APP_BUG_MIN_CLUSTERS,
  ROLLOUT_STATUS_IN_PROGRESS,
  ROLLOUT_STATUS_COMPLETE,
  ROLLOUT_STATUS_FAILED,
  FULL_PROGRESS,
  PARTIAL_PROGRESS,
} = __testables

// ---------------------------------------------------------------------------
// workloadPrefix
// ---------------------------------------------------------------------------

describe('workloadPrefix', () => {
  it('strips pod prefix and both RS + pod hash suffixes', () => {
    expect(workloadPrefix('pod/api-server-7d9f8b6c4f-x2k4q')).toBe('api-server')
  })

  it('strips pod prefix and single hash suffix', () => {
    expect(workloadPrefix('pod/api-server-abc12')).toBe('api-server')
  })

  it('strips deployment prefix', () => {
    expect(workloadPrefix('deployment/api-server')).toBe('api-server')
  })

  it('strips replicaset prefix and hash', () => {
    expect(workloadPrefix('replicaset/api-server-7d9f8b6c4f')).toBe('api-server')
  })

  it('strips statefulset prefix', () => {
    expect(workloadPrefix('statefulset/redis-master')).toBe('redis-master')
  })

  it('strips daemonset prefix', () => {
    expect(workloadPrefix('daemonset/fluentd')).toBe('fluentd')
  })

  it('strips job prefix', () => {
    expect(workloadPrefix('job/backup-12345')).toBe('backup')
  })

  it('keeps non-workload refs as-is (node)', () => {
    expect(workloadPrefix('node/worker-3')).toBe('node/worker-3')
  })

  it('keeps non-workload refs as-is (service)', () => {
    expect(workloadPrefix('service/api-gateway')).toBe('service/api-gateway')
  })

  it('handles pod name without hash suffix', () => {
    expect(workloadPrefix('pod/simple-name')).toBe('simple-name')
  })

  it('handles double-hash suffix pattern', () => {
    expect(workloadPrefix('pod/frontend-app-6b8c9d7e5f-a3b2c')).toBe('frontend-app')
  })

  it('handles name with multiple dashes before hash', () => {
    expect(workloadPrefix('pod/my-long-service-name-8b6c4f2d1e-z9y8x')).toBe('my-long-service-name')
  })
})

// ---------------------------------------------------------------------------
// isCausallyRelated
// ---------------------------------------------------------------------------

describe('isCausallyRelated', () => {
  function makeEvent(reason: string, object: string): ClusterEvent {
    return {
      type: 'Warning',
      reason,
      object,
      message: 'test',
      count: 1,
      firstSeen: '2024-01-01T00:00:00Z',
      lastSeen: '2024-01-01T00:00:00Z',
      cluster: 'cluster-a',
      namespace: 'default',
    }
  }

  it('returns true for events in the same reason family (container lifecycle)', () => {
    const a = makeEvent('BackOff', 'pod/x-abc12-xyz')
    const b = makeEvent('CrashLoopBackOff', 'pod/y-def34-uvw')
    expect(isCausallyRelated(a, b)).toBe(true)
  })

  it('returns true for events in the same reason family (image issues)', () => {
    const a = makeEvent('ImagePullBackOff', 'pod/x-abc12-xyz')
    const b = makeEvent('ErrImagePull', 'pod/y-def34-uvw')
    expect(isCausallyRelated(a, b)).toBe(true)
  })

  it('returns true for events in the same reason family (scheduling)', () => {
    const a = makeEvent('FailedScheduling', 'pod/x-abc12-xyz')
    const b = makeEvent('Unschedulable', 'pod/y-def34-uvw')
    expect(isCausallyRelated(a, b)).toBe(true)
  })

  it('returns true for events in the same reason family (node health)', () => {
    const a = makeEvent('NodeNotReady', 'pod/x-abc12-xyz')
    const b = makeEvent('NodeUnreachable', 'pod/y-def34-uvw')
    expect(isCausallyRelated(a, b)).toBe(true)
  })

  it('returns true for events in the same reason family (mount/volume)', () => {
    const a = makeEvent('FailedMount', 'pod/x-abc12-xyz')
    const b = makeEvent('FailedAttachVolume', 'pod/y-def34-uvw')
    expect(isCausallyRelated(a, b)).toBe(true)
  })

  it('returns true for events in the same reason family (probe failures)', () => {
    const a = makeEvent('Unhealthy', 'pod/x-abc12-xyz')
    const b = makeEvent('LivenessProbe', 'pod/y-def34-uvw')
    expect(isCausallyRelated(a, b)).toBe(true)
  })

  it('returns true for events in the same reason family (network)', () => {
    const a = makeEvent('NetworkNotReady', 'pod/x-abc12-xyz')
    const b = makeEvent('FailedToUpdateEndpoint', 'pod/y-def34-uvw')
    expect(isCausallyRelated(a, b)).toBe(true)
  })

  it('returns true when events share the same workload prefix', () => {
    const a = makeEvent('Unhealthy', 'pod/api-server-7d9f8-x2k4q')
    const b = makeEvent('FailedScheduling', 'pod/api-server-8b6c4-y3m5r')
    expect(isCausallyRelated(a, b)).toBe(true)
  })

  it('returns false for unrelated events (different families, different workloads)', () => {
    const a = makeEvent('BackOff', 'pod/api-abc12-xyz')
    const b = makeEvent('FailedMount', 'pod/storage-def34-uvw')
    expect(isCausallyRelated(a, b)).toBe(false)
  })

  it('returns false for unknown reasons with different workloads', () => {
    const a = makeEvent('CustomReason1', 'pod/service-a-abc12-xyz')
    const b = makeEvent('CustomReason2', 'pod/service-b-def34-uvw')
    expect(isCausallyRelated(a, b)).toBe(false)
  })

  it('returns true when one reason is unknown but workload prefix matches', () => {
    const a = makeEvent('CustomReason', 'pod/api-server-7d9f8b6c4f-x2k4q')
    const b = makeEvent('AnotherReason', 'pod/api-server-8b6c4f2d1e-y3m5r')
    expect(isCausallyRelated(a, b)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getDemoInsights
// ---------------------------------------------------------------------------

describe('getDemoInsights', () => {
  it('returns an array of demo insights', () => {
    const insights = getDemoInsights()
    expect(Array.isArray(insights)).toBe(true)
    expect(insights.length).toBeGreaterThan(0)
  })

  it('includes all 7 insight categories', () => {
    const insights = getDemoInsights()
    const categories = new Set(insights.map(i => i.category))
    expect(categories.has('event-correlation')).toBe(true)
    expect(categories.has('resource-imbalance')).toBe(true)
    expect(categories.has('restart-correlation')).toBe(true)
    expect(categories.has('cascade-impact')).toBe(true)
    expect(categories.has('config-drift')).toBe(true)
    expect(categories.has('cluster-delta')).toBe(true)
    expect(categories.has('rollout-tracker')).toBe(true)
  })

  it('each insight has required fields', () => {
    const insights = getDemoInsights()
    for (const insight of insights) {
      expect(insight.id).toBeTruthy()
      expect(insight.category).toBeTruthy()
      expect(insight.source).toBeTruthy()
      expect(insight.severity).toBeTruthy()
      expect(insight.title).toBeTruthy()
      expect(insight.description).toBeTruthy()
      expect(insight.affectedClusters.length).toBeGreaterThan(0)
      expect(insight.detectedAt).toBeTruthy()
    }
  })

  it('demo timestamps are in the past', () => {
    const insights = getDemoInsights()
    const now = Date.now()
    for (const insight of insights) {
      const ts = new Date(insight.detectedAt).getTime()
      expect(ts).toBeLessThan(now)
    }
  })

  it('includes chain data for cascade insights', () => {
    const insights = getDemoInsights()
    const cascade = insights.find(i => i.category === 'cascade-impact')
    expect(cascade?.chain).toBeDefined()
    expect(cascade!.chain!.length).toBeGreaterThan(0)
  })

  it('includes metrics for resource-imbalance insights', () => {
    const insights = getDemoInsights()
    const imbalance = insights.find(i => i.category === 'resource-imbalance')
    expect(imbalance?.metrics).toBeDefined()
    expect(Object.keys(imbalance!.metrics!).length).toBeGreaterThan(0)
  })

  it('includes deltas for cluster-delta insights', () => {
    const insights = getDemoInsights()
    const delta = insights.find(i => i.category === 'cluster-delta')
    expect(delta?.deltas).toBeDefined()
    expect(delta!.deltas!.length).toBeGreaterThan(0)
  })

  it('includes metrics for rollout-tracker insights', () => {
    const insights = getDemoInsights()
    const rollout = insights.find(i => i.category === 'rollout-tracker')
    expect(rollout?.metrics).toBeDefined()
    expect(rollout!.metrics!.total).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Constants validation
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('REASON_FAMILIES has 7 families', () => {
    expect(REASON_FAMILIES.length).toBe(7)
  })

  it('REASON_TO_FAMILY maps all reasons from all families', () => {
    let totalReasons = 0
    for (const family of REASON_FAMILIES) {
      totalReasons += family.length
    }
    expect(REASON_TO_FAMILY.size).toBe(totalReasons)
  })

  it('REASON_TO_FAMILY maps each reason to its correct family index', () => {
    for (let i = 0; i < REASON_FAMILIES.length; i++) {
      for (const reason of REASON_FAMILIES[i]) {
        expect(REASON_TO_FAMILY.get(reason)).toBe(i)
      }
    }
  })

  it('SEVERITY_RANK orders critical > warning > info', () => {
    expect(SEVERITY_RANK.critical).toBeGreaterThan(SEVERITY_RANK.warning)
    expect(SEVERITY_RANK.warning).toBeGreaterThan(SEVERITY_RANK.info)
  })

  it('MAX_TOP_INSIGHTS is a positive number', () => {
    expect(MAX_TOP_INSIGHTS).toBeGreaterThan(0)
  })

  it('threshold constants are positive numbers', () => {
    expect(RESOURCE_IMBALANCE_THRESHOLD_PCT).toBeGreaterThan(0)
    expect(DELTA_SIGNIFICANCE_HIGH_PCT).toBeGreaterThan(0)
    expect(DELTA_SIGNIFICANCE_MEDIUM_PCT).toBeGreaterThan(0)
    expect(INFRA_ISSUE_MIN_WORKLOADS).toBeGreaterThan(0)
    expect(APP_BUG_MIN_CLUSTERS).toBeGreaterThan(0)
  })

  it('significance thresholds are ordered high > medium', () => {
    expect(DELTA_SIGNIFICANCE_HIGH_PCT).toBeGreaterThan(DELTA_SIGNIFICANCE_MEDIUM_PCT)
  })

  it('rollout status constants are distinct', () => {
    const statuses = new Set([ROLLOUT_STATUS_IN_PROGRESS, ROLLOUT_STATUS_COMPLETE, ROLLOUT_STATUS_FAILED])
    expect(statuses.size).toBe(3)
  })

  it('FULL_PROGRESS is 100 and PARTIAL_PROGRESS is less', () => {
    expect(FULL_PROGRESS).toBe(100)
    expect(PARTIAL_PROGRESS).toBeLessThan(FULL_PROGRESS)
    expect(PARTIAL_PROGRESS).toBeGreaterThan(0)
  })
})
