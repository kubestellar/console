/**
 * Tests for the useCardRecommendations hook.
 *
 * Validates threshold-based recommendation generation, priority assignment,
 * AI-mode filtering, MAX_RECOMMENDATIONS cap, and periodic re-analysis.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — declared before the module under test is imported.
// ---------------------------------------------------------------------------

const mockUsePodIssues = vi.fn()
const mockUseDeploymentIssues = vi.fn()
const mockUseWarningEvents = vi.fn()
const mockUseGPUNodes = vi.fn()
const mockUseClusters = vi.fn()
const mockUseSecurityIssues = vi.fn()

vi.mock('../useMCP', () => ({
  usePodIssues: () => mockUsePodIssues(),
  useDeploymentIssues: () => mockUseDeploymentIssues(),
  useWarningEvents: () => mockUseWarningEvents(),
  useGPUNodes: () => mockUseGPUNodes(),
  useClusters: () => mockUseClusters(),
  useSecurityIssues: () => mockUseSecurityIssues(),
}))

const mockUseAIMode = vi.fn()
vi.mock('../useAIMode', () => ({
  useAIMode: () => mockUseAIMode(),
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  RECOMMENDATION_INTERVAL_MS: 60_000,
} })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setDefaults(overrides: Record<string, unknown> = {}) {
  mockUsePodIssues.mockReturnValue({ issues: overrides.podIssues ?? [] })
  mockUseDeploymentIssues.mockReturnValue({ issues: overrides.deploymentIssues ?? [] })
  mockUseWarningEvents.mockReturnValue({ events: overrides.warningEvents ?? [] })
  mockUseGPUNodes.mockReturnValue({ nodes: overrides.gpuNodes ?? [] })
  mockUseClusters.mockReturnValue({ clusters: overrides.clusters ?? [] })
  mockUseSecurityIssues.mockReturnValue({ issues: overrides.securityIssues ?? [] })
  mockUseAIMode.mockReturnValue({ shouldProactivelySuggest: overrides.shouldProactivelySuggest ?? true })
}

function makeIssues(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `issue-${i}` }))
}

function makeEvents(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `event-${i}`, type: 'Warning' }))
}

function makeGPUNodes(gpuCount: number, gpuAllocated: number, nodeCount = 1) {
  return Array.from({ length: nodeCount }, (_, i) => ({
    name: `gpu-node-${i}`,
    gpuCount: gpuCount / nodeCount,
    gpuAllocated: gpuAllocated / nodeCount,
  }))
}

// ---------------------------------------------------------------------------
// Import the module under test (mocks are hoisted above this)
// ---------------------------------------------------------------------------

import { useCardRecommendations } from '../useCardRecommendations'

// ---------------------------------------------------------------------------
// Stable array references to avoid infinite re-render loops.
// The hook's useCallback depends on currentCardTypes — a new array literal
// on every render would create a new callback → effect → setState → re-render loop.
// ---------------------------------------------------------------------------

const NO_CARDS: string[] = []
const WITH_POD_AND_DEPLOY: string[] = ['pod_issues', 'deployment_issues']

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCardRecommendations', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    setDefaults()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ---- No recommendations when everything is healthy ----

  it('returns no recommendations when cluster state is healthy', () => {
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    expect(result.current.recommendations).toEqual([])
    expect(result.current.hasRecommendations).toBe(false)
    expect(result.current.highPriorityCount).toBe(0)
  })

  // ---- Pod issues threshold ----

  it('does not recommend pod_issues card when issues are at threshold (5)', () => {
    setDefaults({ podIssues: makeIssues(5) })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const podRec = result.current.recommendations.find(r => r.cardType === 'pod_issues')
    expect(podRec).toBeUndefined()
  })

  it('recommends pod_issues card when issues exceed threshold (>5)', () => {
    setDefaults({ podIssues: makeIssues(6) })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const podRec = result.current.recommendations.find(r => r.cardType === 'pod_issues')
    expect(podRec).toBeDefined()
    expect(podRec!.priority).toBe('high')
    expect(podRec!.reason).toContain('6')
  })

  // ---- Deployment issues threshold and priority escalation ----

  it('recommends deployment_issues with medium priority for 1-3 issues', () => {
    setDefaults({ deploymentIssues: makeIssues(2) })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const depRec = result.current.recommendations.find(r => r.cardType === 'deployment_issues')
    expect(depRec).toBeDefined()
    expect(depRec!.priority).toBe('medium')
  })

  it('escalates deployment_issues to high priority when issues exceed 3', () => {
    setDefaults({ deploymentIssues: makeIssues(4) })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const depRec = result.current.recommendations.find(r => r.cardType === 'deployment_issues')
    expect(depRec).toBeDefined()
    expect(depRec!.priority).toBe('high')
  })

  // ---- Warning events threshold ----

  it('does not recommend event_stream when warning events are at threshold (10)', () => {
    setDefaults({ warningEvents: makeEvents(10) })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const eventRec = result.current.recommendations.find(r => r.cardType === 'event_stream')
    expect(eventRec).toBeUndefined()
  })

  it('recommends event_stream card when warning events exceed threshold (>10)', () => {
    setDefaults({ warningEvents: makeEvents(11) })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const eventRec = result.current.recommendations.find(r => r.cardType === 'event_stream')
    expect(eventRec).toBeDefined()
    expect(eventRec!.priority).toBe('medium')
    expect(eventRec!.config).toEqual({ warningsOnly: true })
  })

  // ---- GPU utilization ----

  it('recommends gpu_status when utilization exceeds 90%', () => {
    setDefaults({ gpuNodes: makeGPUNodes(10, 10) }) // 100% utilization
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const gpuRec = result.current.recommendations.find(r => r.cardType === 'gpu_status')
    expect(gpuRec).toBeDefined()
    expect(gpuRec!.priority).toBe('high')
  })

  it('recommends gpu_overview when GPUs exist but utilization is low', () => {
    setDefaults({ gpuNodes: makeGPUNodes(10, 2) }) // 20% utilization
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const gpuRec = result.current.recommendations.find(r => r.cardType === 'gpu_overview')
    expect(gpuRec).toBeDefined()
    expect(gpuRec!.priority).toBe('low')
  })

  it('does not recommend GPU cards when no GPU nodes exist', () => {
    setDefaults({ gpuNodes: [] })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const gpuRecs = result.current.recommendations.filter(
      r => r.cardType === 'gpu_status' || r.cardType === 'gpu_overview'
    )
    expect(gpuRecs).toHaveLength(0)
  })

  // ---- Unhealthy clusters ----

  it('recommends cluster_health card when unhealthy clusters exist', () => {
    setDefaults({ clusters: [{ name: 'c1', healthy: false }, { name: 'c2', healthy: true }] })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const clusterRec = result.current.recommendations.find(r => r.cardType === 'cluster_health')
    expect(clusterRec).toBeDefined()
    expect(clusterRec!.priority).toBe('high')
    expect(clusterRec!.reason).toContain('1')
  })

  // ---- Security issues ----

  it('recommends security_issues with high priority when high severity issues exist', () => {
    setDefaults({ securityIssues: [{ id: 's1', severity: 'high' }, { id: 's2', severity: 'low' }] })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const secRec = result.current.recommendations.find(r => r.cardType === 'security_issues')
    expect(secRec).toBeDefined()
    expect(secRec!.priority).toBe('high')
  })

  it('recommends security_issues with medium priority when no high severity issues', () => {
    setDefaults({ securityIssues: [{ id: 's1', severity: 'low' }] })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const secRec = result.current.recommendations.find(r => r.cardType === 'security_issues')
    expect(secRec).toBeDefined()
    expect(secRec!.priority).toBe('medium')
  })

  // ---- Skips cards already in dashboard ----

  it('does not recommend cards that are already in currentCardTypes', () => {
    setDefaults({
      podIssues: makeIssues(10),
      deploymentIssues: makeIssues(5),
    })
    const { result } = renderHook(() => useCardRecommendations(WITH_POD_AND_DEPLOY))

    const podRec = result.current.recommendations.find(r => r.cardType === 'pod_issues')
    const depRec = result.current.recommendations.find(r => r.cardType === 'deployment_issues')
    expect(podRec).toBeUndefined()
    expect(depRec).toBeUndefined()
  })

  // ---- AI mode filtering ----

  it('shows all recommendations when shouldProactivelySuggest is true', () => {
    setDefaults({
      shouldProactivelySuggest: true,
      deploymentIssues: makeIssues(2),   // medium priority
      warningEvents: makeEvents(15),     // medium priority
    })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const mediumRecs = result.current.recommendations.filter(r => r.priority === 'medium')
    expect(mediumRecs.length).toBeGreaterThan(0)
  })

  it('filters to only high priority when shouldProactivelySuggest is false', () => {
    setDefaults({
      shouldProactivelySuggest: false,
      podIssues: makeIssues(10),         // high priority
      deploymentIssues: makeIssues(2),   // medium priority
      warningEvents: makeEvents(15),     // medium priority
    })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    // Only high priority recs should remain
    result.current.recommendations.forEach(r => {
      expect(r.priority).toBe('high')
    })
    expect(result.current.recommendations.length).toBeGreaterThan(0)
  })

  // ---- MAX_RECOMMENDATIONS cap ----

  it('caps recommendations at 3 (MAX_RECOMMENDATIONS)', () => {
    setDefaults({
      podIssues: makeIssues(10),
      deploymentIssues: makeIssues(5),
      warningEvents: makeEvents(15),
      clusters: [{ name: 'c1', healthy: false }],
      securityIssues: [{ id: 's1', severity: 'high' }],
    })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    expect(result.current.recommendations.length).toBeLessThanOrEqual(3)
  })

  // ---- Priority sorting ----

  it('sorts recommendations by priority: high > medium > low', () => {
    setDefaults({
      podIssues: makeIssues(10),         // high
      deploymentIssues: makeIssues(1),   // medium
      gpuNodes: makeGPUNodes(10, 2),     // low (gpu_overview)
    })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const priorities = result.current.recommendations.map(r => r.priority)
    const order = { high: 0, medium: 1, low: 2 }
    for (let i = 1; i < priorities.length; i++) {
      expect(order[priorities[i]]).toBeGreaterThanOrEqual(order[priorities[i - 1]])
    }
  })

  // ---- highPriorityCount ----

  it('correctly counts high priority recommendations', () => {
    setDefaults({
      podIssues: makeIssues(10),                         // high
      clusters: [{ name: 'c1', healthy: false }],        // high
      deploymentIssues: makeIssues(1),                   // medium
    })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    expect(result.current.highPriorityCount).toBe(2)
  })

  // ---- Periodic re-analysis ----

  it('re-analyzes periodically based on RECOMMENDATION_INTERVAL_MS', () => {
    setDefaults({ podIssues: [] })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    expect(result.current.recommendations).toHaveLength(0)

    // Simulate new pod issues arriving
    mockUsePodIssues.mockReturnValue({ issues: makeIssues(10) })

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    // After the interval fires, the hook should have re-analyzed with new data
    expect(result.current.recommendations.length).toBeGreaterThan(0)
  })

  // ---- Handles undefined/null upstream data ----

  it('handles undefined upstream data gracefully', () => {
    mockUsePodIssues.mockReturnValue({ issues: undefined })
    mockUseDeploymentIssues.mockReturnValue({ issues: undefined })
    mockUseWarningEvents.mockReturnValue({ events: undefined })
    mockUseGPUNodes.mockReturnValue({ nodes: undefined })
    mockUseClusters.mockReturnValue({ clusters: undefined })
    mockUseSecurityIssues.mockReturnValue({ issues: undefined })

    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    expect(result.current.recommendations).toEqual([])
    expect(result.current.hasRecommendations).toBe(false)
  })
})
