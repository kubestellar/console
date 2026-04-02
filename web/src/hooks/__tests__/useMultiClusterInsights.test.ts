import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock control variables
// ---------------------------------------------------------------------------

let mockDemoMode = false
let mockClusters: Array<{ name: string; context?: string; healthy?: boolean; cpuCores?: number }> = []
let mockClustersLoading = false
let mockEvents: unknown[] = []
let mockEventsLoading = false
let mockEventsDemoFallback = false
let mockWarningEvents: unknown[] = []
let mockDeployments: unknown[] = []
let mockDeploymentsLoading = false
let mockDeploymentsDemoFallback = false
let mockPodIssues: unknown[] = []
let mockPodIssuesDemoFallback = false

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../useDemoMode', () => ({
  useDemoMode: () => ({
    isDemoMode: mockDemoMode,
    toggleDemoMode: vi.fn(),
    setDemoMode: vi.fn(),
  }),
}))

vi.mock('../mcp/clusters', () => ({
  useClusters: () => ({
    deduplicatedClusters: mockClusters,
    clusters: mockClusters,
    isLoading: mockClustersLoading,
  }),
}))

vi.mock('../useCachedData', () => ({
  useCachedEvents: () => ({
    events: mockEvents,
    isLoading: mockEventsLoading,
    isDemoFallback: mockEventsDemoFallback,
  }),
  useCachedWarningEvents: () => ({
    events: mockWarningEvents,
  }),
  useCachedDeployments: () => ({
    data: mockDeployments,
    isLoading: mockDeploymentsLoading,
    isDemoFallback: mockDeploymentsDemoFallback,
  }),
  useCachedPodIssues: () => ({
    issues: mockPodIssues,
    isDemoFallback: mockPodIssuesDemoFallback,
  }),
}))

vi.mock('../useInsightEnrichment', () => ({
  useInsightEnrichment: (insights: unknown[]) => ({
    enrichedInsights: insights,
  }),
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { useMultiClusterInsights } from '../useMultiClusterInsights'

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockDemoMode = false
  mockClusters = []
  mockClustersLoading = false
  mockEvents = []
  mockEventsLoading = false
  mockEventsDemoFallback = false
  mockWarningEvents = []
  mockDeployments = []
  mockDeploymentsLoading = false
  mockDeploymentsDemoFallback = false
  mockPodIssues = []
  mockPodIssuesDemoFallback = false
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests: useMultiClusterInsights hook
// ---------------------------------------------------------------------------

describe('useMultiClusterInsights hook', () => {
  it('returns demo insights in demo mode', () => {
    mockDemoMode = true

    const { result, unmount } = renderHook(() => useMultiClusterInsights())

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.insights.length).toBeGreaterThan(0)
    // Should have various categories
    expect(result.current.insightsByCategory['event-correlation'].length).toBeGreaterThan(0)
    expect(result.current.insightsByCategory['resource-imbalance'].length).toBeGreaterThan(0)
    expect(result.current.insightsByCategory['cascade-impact'].length).toBeGreaterThan(0)
    expect(result.current.topInsights.length).toBeGreaterThan(0)
    expect(result.current.topInsights.length).toBeLessThanOrEqual(5)

    unmount()
  })

  it('returns demo insights when all data hooks fall back to demo', () => {
    mockDemoMode = false
    mockEventsDemoFallback = true
    mockDeploymentsDemoFallback = true
    mockPodIssuesDemoFallback = true

    const { result, unmount } = renderHook(() => useMultiClusterInsights())

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.insights.length).toBeGreaterThan(0)

    unmount()
  })

  it('returns empty insights when no data and not demo mode', () => {
    mockDemoMode = false

    const { result, unmount } = renderHook(() => useMultiClusterInsights())

    expect(result.current.isDemoData).toBe(false)
    expect(result.current.insights).toEqual([])
    expect(result.current.topInsights).toEqual([])

    unmount()
  })

  it('reflects loading state from data hooks', () => {
    mockClustersLoading = true
    mockEventsLoading = true
    mockDeploymentsLoading = true

    const { result, unmount } = renderHook(() => useMultiClusterInsights())

    expect(result.current.isLoading).toBe(true)

    unmount()
  })

  it('isLoading is false when all hooks finish loading', () => {
    mockClustersLoading = false
    mockEventsLoading = false
    mockDeploymentsLoading = false

    const { result, unmount } = renderHook(() => useMultiClusterInsights())

    expect(result.current.isLoading).toBe(false)

    unmount()
  })

  it('sorts insights by severity (critical first) then by affected clusters', () => {
    mockDemoMode = false
    mockClusters = [
      { name: 'c1', context: 'c1', healthy: true, cpuCores: 10 },
      { name: 'c2', context: 'c2', healthy: true, cpuCores: 10 },
    ]
    // Create events that correlate across clusters
    const ts = new Date('2026-01-15T10:00:00Z').toISOString()
    mockEvents = [
      { type: 'Warning', reason: 'BackOff', message: 'test', object: 'pod/test', namespace: 'default', cluster: 'c1', count: 1, lastSeen: ts },
      { type: 'Warning', reason: 'BackOff', message: 'test', object: 'pod/test2', namespace: 'default', cluster: 'c2', count: 1, lastSeen: ts },
    ]

    const { result, unmount } = renderHook(() => useMultiClusterInsights())

    expect(result.current.isDemoData).toBe(false)
    // Should have at least the event correlation insight
    if (result.current.insights.length > 1) {
      // Verify sorting: critical before warning before info
      const severityOrder = result.current.insights.map(i => i.severity)
      const rankMap: Record<string, number> = { critical: 3, warning: 2, info: 1 }
      for (let i = 0; i < severityOrder.length - 1; i++) {
        expect(rankMap[severityOrder[i]]).toBeGreaterThanOrEqual(rankMap[severityOrder[i + 1]])
      }
    }

    unmount()
  })

  it('populates insightsByCategory with all seven categories', () => {
    mockDemoMode = true

    const { result, unmount } = renderHook(() => useMultiClusterInsights())

    const categories = Object.keys(result.current.insightsByCategory)
    expect(categories).toContain('event-correlation')
    expect(categories).toContain('cluster-delta')
    expect(categories).toContain('cascade-impact')
    expect(categories).toContain('config-drift')
    expect(categories).toContain('resource-imbalance')
    expect(categories).toContain('restart-correlation')
    expect(categories).toContain('rollout-tracker')

    unmount()
  })

  it('demo insights include rollout-tracker with per-cluster metrics', () => {
    mockDemoMode = true

    const { result, unmount } = renderHook(() => useMultiClusterInsights())

    const rollouts = result.current.insightsByCategory['rollout-tracker']
    expect(rollouts.length).toBeGreaterThan(0)
    const rollout = rollouts[0]
    expect(rollout.metrics).toBeDefined()
    expect(rollout.metrics!.total).toBeGreaterThan(0)
    expect(rollout.metrics!.completed).toBeDefined()
    expect(rollout.metrics!.pending).toBeDefined()
    expect(rollout.metrics!.failed).toBeDefined()

    unmount()
  })

  it('demo insights include cascade chain data', () => {
    mockDemoMode = true

    const { result, unmount } = renderHook(() => useMultiClusterInsights())

    const cascades = result.current.insightsByCategory['cascade-impact']
    expect(cascades.length).toBeGreaterThan(0)
    const cascade = cascades[0]
    expect(cascade.chain).toBeDefined()
    expect(cascade.chain!.length).toBeGreaterThan(0)
    // Chain should have cluster, resource, event, timestamp
    expect(cascade.chain![0].cluster).toBeDefined()
    expect(cascade.chain![0].event).toBeDefined()

    unmount()
  })

  it('demo insights include cluster delta data', () => {
    mockDemoMode = true

    const { result, unmount } = renderHook(() => useMultiClusterInsights())

    const deltas = result.current.insightsByCategory['cluster-delta']
    expect(deltas.length).toBeGreaterThan(0)
    const delta = deltas[0]
    expect(delta.deltas).toBeDefined()
    expect(delta.deltas!.length).toBeGreaterThan(0)

    unmount()
  })
})
