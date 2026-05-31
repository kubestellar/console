import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClusterEvent, ClusterInfo, Deployment, PodIssue } from '../../hooks/mcp/types'
import type { MultiClusterInsight } from '../../types/insights'

import {
  buildInsights,
  detectCascadeImpact,
  detectClusterDeltas,
  detectConfigDrift,
  detectEventCorrelations,
  detectResourceImbalance,
  detectRestartCorrelation,
  getTopInsights,
  groupInsightsByCategory,
  trackRolloutProgress,
} from './analysis'

const FIXED_NOW = new Date('2025-01-01T00:00:00.000Z')

function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    name: 'cluster-a',
    context: 'cluster-a',
    healthy: true,
    ...overrides,
  }
}

function makeDeployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    name: 'api',
    namespace: 'default',
    cluster: 'cluster-a',
    status: 'running',
    replicas: 3,
    readyReplicas: 3,
    updatedReplicas: 3,
    availableReplicas: 3,
    progress: 100,
    image: 'ghcr.io/example/api:v1.0.0',
    ...overrides,
  }
}

function makeEvent(overrides: Partial<ClusterEvent> = {}): ClusterEvent {
  return {
    type: 'Warning',
    reason: 'BackOff',
    message: 'container failed',
    object: 'pod/api-7b9c8d4f5f-abc12',
    namespace: 'default',
    cluster: 'cluster-a',
    count: 1,
    firstSeen: '2025-01-01T00:00:00.000Z',
    lastSeen: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makePodIssue(overrides: Partial<PodIssue> = {}): PodIssue {
  return {
    name: 'api-7b9c8d4f5f-abc12',
    namespace: 'default',
    cluster: 'cluster-a',
    status: 'CrashLoopBackOff',
    issues: ['CrashLoopBackOff'],
    restarts: 4,
    ...overrides,
  }
}

function makeInsight(overrides: Partial<MultiClusterInsight> = {}): MultiClusterInsight {
  return {
    id: 'insight-1',
    category: 'cluster-delta',
    source: 'heuristic',
    severity: 'info',
    title: 'Example insight',
    description: 'Example description',
    affectedClusters: ['cluster-a'],
    detectedAt: FIXED_NOW.toISOString(),
    ...overrides,
  }
}

describe('insights analysis helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('detects event correlations across clusters in the same time window', () => {
    const insights = detectEventCorrelations([
      makeEvent({ cluster: 'cluster-a', reason: 'BackOff', count: 2, lastSeen: '2025-01-01T00:02:00.000Z' }),
      makeEvent({ cluster: 'cluster-b', reason: 'BackOff', count: 3, object: 'pod/worker-7b9c8d4f5f-def34', lastSeen: '2025-01-01T00:04:00.000Z' }),
      makeEvent({ cluster: 'cluster-c', lastSeen: undefined }),
    ])

    expect(insights).toHaveLength(1)
    expect(insights[0]).toMatchObject({
      id: `event-correlation:${Date.parse('2025-01-01T00:00:00.000Z')}`,
      category: 'event-correlation',
      severity: 'warning',
      affectedClusters: ['cluster-a', 'cluster-b'],
      relatedResources: ['pod/api-7b9c8d4f5f-abc12', 'pod/worker-7b9c8d4f5f-def34'],
      detectedAt: '2025-01-01T00:00:00.000Z',
    })
    expect(insights[0].description).toContain('5 warning events')
  })

  it('detects cluster deltas for image, replicas, and status differences', () => {
    const insights = detectClusterDeltas(
      [
        makeDeployment({ cluster: 'cluster-a', image: 'ghcr.io/example/api:v1.0.0', replicas: 6, status: 'running' }),
        makeDeployment({ cluster: 'cluster-b', image: 'ghcr.io/example/api:v2.0.0', replicas: 3, status: 'failed' }),
      ],
      [makeCluster({ name: 'cluster-a' }), makeCluster({ name: 'cluster-b', context: 'cluster-b' })],
    )

    expect(insights).toHaveLength(1)
    expect(insights[0]).toMatchObject({
      id: 'cluster-delta:default/api',
      category: 'cluster-delta',
      severity: 'warning',
      affectedClusters: ['cluster-a', 'cluster-b'],
      relatedResources: ['default/api'],
      detectedAt: FIXED_NOW.toISOString(),
    })
    expect(insights[0].deltas).toEqual([
      {
        dimension: 'Image Version',
        clusterA: { name: 'cluster-a', value: 'ghcr.io/example/api:v1.0.0' },
        clusterB: { name: 'cluster-b', value: 'ghcr.io/example/api:v2.0.0' },
        significance: 'high',
      },
      {
        dimension: 'Replica Count',
        clusterA: { name: 'cluster-a', value: 6 },
        clusterB: { name: 'cluster-b', value: 3 },
        significance: 'high',
      },
      {
        dimension: 'Status',
        clusterA: { name: 'cluster-a', value: 'running' },
        clusterB: { name: 'cluster-b', value: 'failed' },
        significance: 'high',
      },
    ])
  })

  it('detects cascading warnings across clusters', () => {
    const insights = detectCascadeImpact([
      makeEvent({ cluster: 'cluster-a', reason: 'BackOff', object: 'pod/api-7b9c8d4f5f-abc12', lastSeen: '2025-01-01T00:00:00.000Z' }),
      makeEvent({ cluster: 'cluster-b', reason: 'ImagePullBackOff', object: 'pod/api-7b9c8d4f5f-def34', lastSeen: '2025-01-01T00:05:00.000Z' }),
      makeEvent({ cluster: 'cluster-c', reason: 'CrashLoopBackOff', object: 'pod/worker-7b9c8d4f5f-ghi56', lastSeen: '2025-01-01T00:10:00.000Z' }),
    ])

    expect(insights).toHaveLength(1)
    expect(insights[0]).toMatchObject({
      id: `cascade-impact:${Date.parse('2025-01-01T00:00:00.000Z')}`,
      category: 'cascade-impact',
      severity: 'critical',
      affectedClusters: ['cluster-a', 'cluster-b', 'cluster-c'],
      detectedAt: '2025-01-01T00:00:00.000Z',
    })
    expect(insights[0].chain).toHaveLength(3)
  })

  it('detects config drift for workloads with differing image and replica counts', () => {
    const insights = detectConfigDrift([
      makeDeployment({ cluster: 'cluster-a', image: 'ghcr.io/example/api:v1.0.0', replicas: 2 }),
      makeDeployment({ cluster: 'cluster-b', image: 'ghcr.io/example/api:v2.0.0', replicas: 5 }),
    ])

    expect(insights).toHaveLength(1)
    expect(insights[0]).toMatchObject({
      id: 'config-drift:default/api',
      category: 'config-drift',
      severity: 'warning',
      affectedClusters: ['cluster-a', 'cluster-b'],
      relatedResources: ['default/api'],
      detectedAt: FIXED_NOW.toISOString(),
    })
    expect(insights[0].description).toContain('2 different images')
    expect(insights[0].description).toContain('2 different replica counts')
  })

  it('detects CPU and memory imbalance across healthy clusters', () => {
    const insights = detectResourceImbalance([
      makeCluster({ name: 'cluster-a', cpuCores: 10, cpuUsageCores: 9.5, memoryGB: 100, memoryUsageGB: 95 }),
      makeCluster({ name: 'cluster-b', context: 'cluster-b', cpuCores: 10, cpuUsageCores: 5, memoryGB: 100, memoryUsageGB: 50 }),
      makeCluster({ name: 'cluster-c', context: 'cluster-c', cpuCores: 10, cpuUsageCores: 1, memoryGB: 100, memoryUsageGB: 10 }),
    ])

    expect(insights).toHaveLength(2)
    expect(insights).toEqual([
      expect.objectContaining({
        id: 'resource-imbalance:cpu',
        category: 'resource-imbalance',
        severity: 'critical',
        affectedClusters: ['cluster-a', 'cluster-c'],
        detectedAt: FIXED_NOW.toISOString(),
        metrics: { 'cluster-a': 95, 'cluster-b': 50, 'cluster-c': 10 },
      }),
      expect.objectContaining({
        id: 'resource-imbalance:memory',
        category: 'resource-imbalance',
        severity: 'critical',
        affectedClusters: ['cluster-a', 'cluster-c'],
        detectedAt: FIXED_NOW.toISOString(),
        metrics: { 'cluster-a': 95, 'cluster-b': 50, 'cluster-c': 10 },
      }),
    ])
  })

  it('detects restart correlation for app bugs and infrastructure issues', () => {
    const insights = detectRestartCorrelation([
      makePodIssue({ cluster: 'cluster-a', name: 'api-7b9c8d4f5f-abc12', restarts: 9 }),
      makePodIssue({ cluster: 'cluster-b', name: 'api-7b9c8d4f5f-def34', restarts: 12 }),
      makePodIssue({ cluster: 'cluster-c', name: 'web-7b9c8d4f5f-ghi56', restarts: 5 }),
      makePodIssue({ cluster: 'cluster-c', name: 'worker-7b9c8d4f5f-jkl78', restarts: 6 }),
      makePodIssue({ cluster: 'cluster-c', name: 'scheduler-7b9c8d4f5f-mno90', restarts: 7 }),
    ])

    expect(insights).toHaveLength(2)
    expect(insights[0]).toMatchObject({
      id: 'restart-correlation:app-bug:default/api',
      category: 'restart-correlation',
      severity: 'critical',
      affectedClusters: ['cluster-a', 'cluster-b'],
      relatedResources: ['default/api'],
      detectedAt: FIXED_NOW.toISOString(),
    })
    expect(insights[1]).toMatchObject({
      id: 'restart-correlation:infra-issue:cluster-c',
      category: 'restart-correlation',
      severity: 'warning',
      affectedClusters: ['cluster-c'],
      relatedResources: ['default/web', 'default/worker', 'default/scheduler'],
      detectedAt: FIXED_NOW.toISOString(),
    })
  })

  it('tracks rollout progress with per-cluster status metrics', () => {
    const insights = trackRolloutProgress([
      makeDeployment({ cluster: 'cluster-a', image: 'ghcr.io/example/api:v2.0.0', status: 'running' }),
      makeDeployment({ cluster: 'cluster-b', image: 'ghcr.io/example/api:v1.0.0', status: 'deploying', replicas: 4, readyReplicas: 1 }),
      makeDeployment({ cluster: 'cluster-c', image: 'ghcr.io/example/api:v1.0.0', status: 'failed', replicas: 4, readyReplicas: 0 }),
    ])

    expect(insights).toHaveLength(1)
    expect(insights[0]).toMatchObject({
      id: 'rollout-tracker:default/api',
      category: 'rollout-tracker',
      severity: 'warning',
      affectedClusters: ['cluster-a', 'cluster-b', 'cluster-c'],
      relatedResources: ['default/api'],
      detectedAt: FIXED_NOW.toISOString(),
      metrics: {
        completed: 1,
        pending: 1,
        failed: 1,
        total: 3,
        cluster-a_progress: 100,
        cluster-a_status: 2,
        cluster-b_progress: 25,
        cluster-b_status: 1,
        cluster-c_progress: 0,
        cluster-c_status: 3,
      },
    })
  })

  it('builds, groups, and truncates top insights deterministically', () => {
    const insights = buildInsights({
      deduplicatedClusters: [
        makeCluster({ name: 'cluster-a', cpuCores: 10, cpuUsageCores: 9.5 }),
        makeCluster({ name: 'cluster-b', context: 'cluster-b', cpuCores: 10, cpuUsageCores: 5 }),
        makeCluster({ name: 'cluster-c', context: 'cluster-c', cpuCores: 10, cpuUsageCores: 1 }),
      ],
      deployments: [
        makeDeployment({ cluster: 'cluster-a', image: 'ghcr.io/example/api:v2.0.0', status: 'running' }),
        makeDeployment({ cluster: 'cluster-b', image: 'ghcr.io/example/api:v1.0.0', status: 'failed' }),
      ],
      events: [
        makeEvent({ cluster: 'cluster-a', lastSeen: '2025-01-01T00:02:00.000Z' }),
        makeEvent({ cluster: 'cluster-b', object: 'pod/worker-7b9c8d4f5f-def34', lastSeen: '2025-01-01T00:04:00.000Z' }),
      ],
      warningEvents: [
        makeEvent({ cluster: 'cluster-a', lastSeen: '2025-01-01T00:00:00.000Z' }),
        makeEvent({ cluster: 'cluster-b', object: 'pod/api-7b9c8d4f5f-def34', reason: 'ImagePullBackOff', lastSeen: '2025-01-01T00:03:00.000Z' }),
      ],
      podIssues: [
        makePodIssue({ cluster: 'cluster-a', name: 'api-7b9c8d4f5f-abc12', restarts: 5 }),
        makePodIssue({ cluster: 'cluster-b', name: 'api-7b9c8d4f5f-def34', restarts: 5 }),
      ],
    })

    expect(insights[0].severity).toBe('critical')
    expect(insights[0].category).toBe('resource-imbalance')

    const grouped = groupInsightsByCategory(insights)
    expect(grouped['cluster-delta']).toHaveLength(1)
    expect(grouped['event-correlation']).toHaveLength(1)
    expect(grouped['resource-imbalance']).toHaveLength(1)
    expect(grouped['restart-correlation']).toHaveLength(1)
    expect(grouped['rollout-tracker']).toHaveLength(1)
    expect(grouped['config-drift']).toHaveLength(1)
    expect(grouped['cascade-impact']).toHaveLength(1)

    const extraInsights = [
      ...insights,
      makeInsight({ id: 'extra-1' }),
      makeInsight({ id: 'extra-2' }),
      makeInsight({ id: 'extra-3' }),
      makeInsight({ id: 'extra-4' }),
      makeInsight({ id: 'extra-5' }),
    ]
    expect(getTopInsights(extraInsights).map(insight => insight.id)).toEqual(extraInsights.slice(0, 5).map(insight => insight.id))
  })
})
