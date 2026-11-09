import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// `useMultiClusterInsights()` itself (the exported hook, as opposed to the
// pure helpers re-exported from `../lib/insights`) had zero direct test
// coverage: every existing test file in this directory exercises the pure
// `lib/insights` functions via the `__testables`/re-export surface, never the
// hook's own wiring (demo-mode fallback, loading/refreshing aggregation,
// isFailed/consecutiveFailures passthrough, and the memoized
// insights -> insightsByCategory/topInsights pipeline).

const mockUseClusters = vi.fn()
const mockUseCachedEvents = vi.fn()
const mockUseCachedWarningEvents = vi.fn()
const mockUseCachedDeployments = vi.fn()
const mockUseCachedPodIssues = vi.fn()
const mockUseDemoMode = vi.fn()
const mockUseInsightEnrichment = vi.fn()
const mockBuildInsights = vi.fn()
const mockGetDemoInsights = vi.fn()
const mockGroupInsightsByCategory = vi.fn()
const mockGetTopInsights = vi.fn()

vi.mock('../mcp/clusters', () => ({
  useClusters: () => mockUseClusters(),
}))

vi.mock('../useCachedData', () => ({
  useCachedEvents: () => mockUseCachedEvents(),
  useCachedWarningEvents: () => mockUseCachedWarningEvents(),
  useCachedDeployments: () => mockUseCachedDeployments(),
  useCachedPodIssues: () => mockUseCachedPodIssues(),
}))

vi.mock('../useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../useInsightEnrichment', () => ({
  useInsightEnrichment: (insights: unknown) => mockUseInsightEnrichment(insights),
}))

vi.mock('../../lib/insights', async () => {
  const actual = await vi.importActual<typeof import('../../lib/insights')>('../../lib/insights')
  return {
    ...actual,
    buildInsights: (...args: unknown[]) => mockBuildInsights(...args),
    getDemoInsights: (...args: unknown[]) => mockGetDemoInsights(...args),
    groupInsightsByCategory: (...args: unknown[]) => mockGroupInsightsByCategory(...args),
    getTopInsights: (...args: unknown[]) => mockGetTopInsights(...args),
  }
})

import { useMultiClusterInsights } from '../useMultiClusterInsights'

const CLUSTER_A = { name: 'cluster-a' } as never

function setDefaultMocks() {
  mockUseClusters.mockReturnValue({
    deduplicatedClusters: [CLUSTER_A],
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
  })
  mockUseCachedEvents.mockReturnValue({
    events: ['event-a'],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
  })
  mockUseCachedWarningEvents.mockReturnValue({ events: ['warning-a'] })
  mockUseCachedDeployments.mockReturnValue({
    data: ['deployment-a'],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
  })
  mockUseCachedPodIssues.mockReturnValue({ issues: ['pod-issue-a'], isDemoFallback: false })
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockUseInsightEnrichment.mockReturnValue({ enrichedInsights: ['enriched-a'] })
  mockBuildInsights.mockReturnValue(['built-a'])
  mockGetDemoInsights.mockReturnValue(['demo-a'])
  mockGroupInsightsByCategory.mockReturnValue({ category: ['enriched-a'] })
  mockGetTopInsights.mockReturnValue(['top-a'])
}

describe('useMultiClusterInsights (hook)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setDefaultMocks()
  })

  it('builds insights from real data when not in demo mode', () => {
    const { result } = renderHook(() => useMultiClusterInsights())

    expect(mockBuildInsights).toHaveBeenCalledWith({
      deduplicatedClusters: [CLUSTER_A],
      deployments: ['deployment-a'],
      events: ['event-a'],
      podIssues: ['pod-issue-a'],
      warningEvents: ['warning-a'],
    })
    expect(mockGetDemoInsights).not.toHaveBeenCalled()
    expect(mockUseInsightEnrichment).toHaveBeenCalledWith(['built-a'])
    expect(result.current.insights).toEqual(['enriched-a'])
    expect(result.current.isDemoData).toBe(false)
  })

  it('falls back to [] for each data source that is null/undefined', () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: undefined,
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
    })
    mockUseCachedEvents.mockReturnValue({
      events: undefined,
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
    })
    mockUseCachedWarningEvents.mockReturnValue({ events: undefined })
    mockUseCachedDeployments.mockReturnValue({
      data: undefined,
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
    })
    mockUseCachedPodIssues.mockReturnValue({ issues: undefined, isDemoFallback: false })

    renderHook(() => useMultiClusterInsights())

    expect(mockBuildInsights).toHaveBeenCalledWith({
      deduplicatedClusters: [],
      deployments: [],
      events: [],
      podIssues: [],
      warningEvents: [],
    })
  })

  it('uses demo insights when useDemoMode() reports demo mode, skipping buildInsights', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useMultiClusterInsights())

    expect(mockGetDemoInsights).toHaveBeenCalled()
    expect(mockBuildInsights).not.toHaveBeenCalled()
    expect(result.current.isDemoData).toBe(true)
    expect(mockUseInsightEnrichment).toHaveBeenCalledWith(['demo-a'])
  })

  it('falls back to demo insights when every cached data source reports a demo fallback, even outside demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
    mockUseCachedEvents.mockReturnValue({
      events: ['event-a'],
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: true,
    })
    mockUseCachedDeployments.mockReturnValue({
      data: ['deployment-a'],
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: true,
    })
    mockUseCachedPodIssues.mockReturnValue({ issues: ['pod-issue-a'], isDemoFallback: true })

    const { result } = renderHook(() => useMultiClusterInsights())

    expect(mockGetDemoInsights).toHaveBeenCalled()
    expect(mockBuildInsights).not.toHaveBeenCalled()
    expect(result.current.isDemoData).toBe(true)
  })

  it('does not treat a partial demo fallback (only some sources) as demo data', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
    mockUseCachedEvents.mockReturnValue({
      events: ['event-a'],
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: true,
    })
    // deployments and pod issues stay non-fallback (see setDefaultMocks)

    const { result } = renderHook(() => useMultiClusterInsights())

    expect(mockBuildInsights).toHaveBeenCalled()
    expect(result.current.isDemoData).toBe(false)
  })

  it('aggregates isLoading/isRefreshing as true if any of clusters/events/deployments report it', () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [CLUSTER_A],
      isLoading: false,
      isRefreshing: true,
      isFailed: false,
      consecutiveFailures: 0,
    })
    mockUseCachedEvents.mockReturnValue({
      events: ['event-a'],
      isLoading: true,
      isRefreshing: false,
      isDemoFallback: false,
    })

    const { result } = renderHook(() => useMultiClusterInsights())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.isRefreshing).toBe(true)
  })

  it('reports isLoading/isRefreshing false only when every source is settled', () => {
    const { result } = renderHook(() => useMultiClusterInsights())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.isRefreshing).toBe(false)
  })

  it('passes through isFailed and defaults consecutiveFailures to 0 when undefined', () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [CLUSTER_A],
      isLoading: false,
      isRefreshing: false,
      isFailed: true,
      consecutiveFailures: undefined,
    })

    const { result } = renderHook(() => useMultiClusterInsights())

    expect(result.current.isFailed).toBe(true)
    expect(result.current.consecutiveFailures).toBe(0)
  })

  it('passes through a non-zero consecutiveFailures count', () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [CLUSTER_A],
      isLoading: false,
      isRefreshing: false,
      isFailed: true,
      consecutiveFailures: 3,
    })

    const { result } = renderHook(() => useMultiClusterInsights())

    expect(result.current.consecutiveFailures).toBe(3)
  })

  it('derives insightsByCategory and topInsights from the enriched insights', () => {
    const { result } = renderHook(() => useMultiClusterInsights())

    expect(mockGroupInsightsByCategory).toHaveBeenCalledWith(['enriched-a'])
    expect(mockGetTopInsights).toHaveBeenCalledWith(['enriched-a'])
    expect(result.current.insightsByCategory).toEqual({ category: ['enriched-a'] })
    expect(result.current.topInsights).toEqual(['top-a'])
  })

  it('falls back to [] for grouping/top-insights helpers when enrichment yields no insights', () => {
    mockUseInsightEnrichment.mockReturnValue({ enrichedInsights: undefined })

    renderHook(() => useMultiClusterInsights())

    expect(mockGroupInsightsByCategory).toHaveBeenCalledWith([])
    expect(mockGetTopInsights).toHaveBeenCalledWith([])
  })
})
