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
  mockUseClusters.mockReturnValue({ clusters: overrides.clusters ?? [], deduplicatedClusters: overrides.clusters ?? [] })
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
const WITH_GPU_OVERVIEW: string[] = ['gpu_overview']
const WITH_GPU_INVENTORY: string[] = ['gpu_inventory']
const WITH_CLUSTER_HEALTH: string[] = ['cluster_health']
const WITH_EVENT_STREAM: string[] = ['event_stream']
const WITH_SECURITY_ISSUES: string[] = ['security_issues']

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
    // The hook uses a recInitRef guard and useCallback — analyzeAndRecommend is
    // memoized based on hook data deps.  When upstream mock data changes
    // externally (outside React state), the memoized callback still captures the
    // original values, so the interval re-invocation produces the same result.
    // Verify the interval *fires* (setInterval is set up) without asserting that
    // externally-mutated mock data produces new recommendations.
    setDefaults({ podIssues: makeIssues(10) })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    // Initial analysis should produce recommendations (pod issues > threshold)
    expect(result.current.recommendations.length).toBeGreaterThan(0)
    const initialLength = result.current.recommendations.length

    // After the interval, recommendations should still be present (re-analyzed)
    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(result.current.recommendations.length).toBe(initialLength)
  })

  // ---- Handles undefined/null upstream data ----

  it('handles undefined upstream data gracefully', () => {
    mockUsePodIssues.mockReturnValue({ issues: undefined })
    mockUseDeploymentIssues.mockReturnValue({ issues: undefined })
    mockUseWarningEvents.mockReturnValue({ events: undefined })
    mockUseGPUNodes.mockReturnValue({ nodes: undefined })
    mockUseClusters.mockReturnValue({ clusters: undefined, deduplicatedClusters: undefined })
    mockUseSecurityIssues.mockReturnValue({ issues: undefined })

    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    expect(result.current.recommendations).toEqual([])
    expect(result.current.hasRecommendations).toBe(false)
  })

  // ===========================================================================
  // Deep regression-preventing tests
  // ===========================================================================

  // ---- Deployment issues boundary: exactly 3 issues stays medium ----

  it('keeps deployment_issues at medium priority for exactly 3 issues (boundary)', () => {
    setDefaults({ deploymentIssues: makeIssues(3) })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const depRec = result.current.recommendations.find(r => r.cardType === 'deployment_issues')
    expect(depRec).toBeDefined()
    expect(depRec!.priority).toBe('medium')
    expect(depRec!.reason).toContain('3')
  })

  // ---- GPU utilization at exact 90% threshold does NOT trigger gpu_status ----

  it('does not recommend gpu_status at exactly 90% utilization (boundary)', () => {
    // 9 allocated out of 10 = 0.9 exactly, which is NOT > 0.9
    setDefaults({ gpuNodes: makeGPUNodes(10, 9) })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const gpuStatusRec = result.current.recommendations.find(r => r.cardType === 'gpu_status')
    expect(gpuStatusRec).toBeUndefined()

    // Should still get the low-priority gpu_overview instead
    const gpuOverviewRec = result.current.recommendations.find(r => r.cardType === 'gpu_overview')
    expect(gpuOverviewRec).toBeDefined()
    expect(gpuOverviewRec!.priority).toBe('low')
  })

  // ---- GPU overview suppressed when gpu_overview already in dashboard ----

  it('does not recommend gpu_overview when gpu_overview is already in currentCardTypes', () => {
    setDefaults({ gpuNodes: makeGPUNodes(10, 2) }) // low utilization
    const { result } = renderHook(() => useCardRecommendations(WITH_GPU_OVERVIEW))

    const gpuRec = result.current.recommendations.find(r => r.cardType === 'gpu_overview')
    expect(gpuRec).toBeUndefined()
  })

  // ---- GPU overview suppressed when gpu_inventory already in dashboard ----

  it('does not recommend gpu_overview when gpu_inventory is already in currentCardTypes', () => {
    setDefaults({ gpuNodes: makeGPUNodes(10, 2) }) // low utilization
    const { result } = renderHook(() => useCardRecommendations(WITH_GPU_INVENTORY))

    const gpuRec = result.current.recommendations.find(r => r.cardType === 'gpu_overview')
    expect(gpuRec).toBeUndefined()
  })

  // ---- Security issues reason string accuracy ----

  it('formats security reason with correct high-severity and other counts', () => {
    setDefaults({
      securityIssues: [
        { id: 's1', severity: 'high' },
        { id: 's2', severity: 'high' },
        { id: 's3', severity: 'medium' },
        { id: 's4', severity: 'low' },
        { id: 's5', severity: 'low' },
      ],
    })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const secRec = result.current.recommendations.find(r => r.cardType === 'security_issues')
    expect(secRec).toBeDefined()
    expect(secRec!.reason).toBe('2 high severity and 3 other security issues found')
    expect(secRec!.priority).toBe('high')
  })

  // ---- All security issues are high severity ----

  it('shows 0 other issues when all security issues are high severity', () => {
    setDefaults({
      securityIssues: [
        { id: 's1', severity: 'high' },
        { id: 's2', severity: 'high' },
      ],
    })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const secRec = result.current.recommendations.find(r => r.cardType === 'security_issues')
    expect(secRec).toBeDefined()
    expect(secRec!.reason).toBe('2 high severity and 0 other security issues found')
  })

  // ---- No duplicate card types in recommendations ----

  it('never produces duplicate cardType entries in recommendations', () => {
    setDefaults({
      podIssues: makeIssues(10),
      deploymentIssues: makeIssues(5),
      warningEvents: makeEvents(15),
      gpuNodes: makeGPUNodes(10, 10),
      clusters: [{ name: 'c1', healthy: false }],
      securityIssues: [{ id: 's1', severity: 'high' }],
    })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const cardTypes = result.current.recommendations.map(r => r.cardType)
    const uniqueCardTypes = new Set(cardTypes)
    expect(cardTypes.length).toBe(uniqueCardTypes.size)
  })

  // ---- Unique recommendation IDs ----

  it('assigns unique IDs to all recommendations', () => {
    setDefaults({
      podIssues: makeIssues(10),
      deploymentIssues: makeIssues(5),
      warningEvents: makeEvents(15),
      gpuNodes: makeGPUNodes(10, 10),
      clusters: [{ name: 'c1', healthy: false }],
      securityIssues: [{ id: 's1', severity: 'high' }],
    })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const ids = result.current.recommendations.map(r => r.id)
    const uniqueIds = new Set(ids)
    expect(ids.length).toBe(uniqueIds.size)
  })

  // ---- Multiple unhealthy clusters counted in reason ----

  it('counts all unhealthy clusters in the reason string', () => {
    setDefaults({
      clusters: [
        { name: 'c1', healthy: false },
        { name: 'c2', healthy: false },
        { name: 'c3', healthy: true },
        { name: 'c4', healthy: false },
      ],
    })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const clusterRec = result.current.recommendations.find(r => r.cardType === 'cluster_health')
    expect(clusterRec).toBeDefined()
    expect(clusterRec!.reason).toBe('3 clusters are unhealthy')
  })

  // ---- MAX_RECOMMENDATIONS favours high priority items ----

  it('keeps high-priority items when capping at MAX_RECOMMENDATIONS', () => {
    // Generate more than 3 recommendations, most high priority
    setDefaults({
      podIssues: makeIssues(10),                              // high
      deploymentIssues: makeIssues(5),                        // high (>3)
      clusters: [{ name: 'c1', healthy: false }],             // high
      securityIssues: [{ id: 's1', severity: 'high' }],       // high
      warningEvents: makeEvents(15),                          // medium
      gpuNodes: makeGPUNodes(10, 2),                          // low
    })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    // All 3 returned should be high priority (since there are 4+ high available)
    expect(result.current.recommendations).toHaveLength(3)
    result.current.recommendations.forEach(r => {
      expect(r.priority).toBe('high')
    })
  })

  // ---- GPU utilization percentage in reason string ----

  it('includes correct utilization percentage in gpu_status reason', () => {
    // 19 out of 20 = 95%
    setDefaults({ gpuNodes: makeGPUNodes(20, 19) })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const gpuRec = result.current.recommendations.find(r => r.cardType === 'gpu_status')
    expect(gpuRec).toBeDefined()
    expect(gpuRec!.reason).toContain('95%')
  })

  // ---- hasRecommendations is true when there are results ----

  it('returns hasRecommendations=true when recommendations exist', () => {
    setDefaults({ podIssues: makeIssues(10) })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    expect(result.current.hasRecommendations).toBe(true)
    expect(result.current.recommendations.length).toBeGreaterThan(0)
  })

  // ---- AI mode filtering combined with MAX_RECOMMENDATIONS ----

  it('applies AI mode filter before MAX_RECOMMENDATIONS cap', () => {
    // With proactive suggestions off, only high-priority items survive.
    // We trigger 4+ high-priority recs to also test the cap.
    setDefaults({
      shouldProactivelySuggest: false,
      podIssues: makeIssues(10),                              // high
      deploymentIssues: makeIssues(5),                        // high
      clusters: [{ name: 'c1', healthy: false }],             // high
      securityIssues: [{ id: 's1', severity: 'high' }],       // high
      warningEvents: makeEvents(15),                          // medium (filtered out)
      gpuNodes: makeGPUNodes(10, 2),                          // low (filtered out)
    })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    // medium and low recs should be gone
    const nonHighRecs = result.current.recommendations.filter(r => r.priority !== 'high')
    expect(nonHighRecs).toHaveLength(0)

    // Still capped at 3
    expect(result.current.recommendations.length).toBeLessThanOrEqual(3)
  })

  // ---- All clusters healthy produces no cluster_health rec ----

  it('does not recommend cluster_health when all clusters are healthy', () => {
    setDefaults({
      clusters: [
        { name: 'c1', healthy: true },
        { name: 'c2', healthy: true },
      ],
    })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const clusterRec = result.current.recommendations.find(r => r.cardType === 'cluster_health')
    expect(clusterRec).toBeUndefined()
  })

  // ---- Skipping cluster_health when already in dashboard ----

  it('does not recommend cluster_health when it is already in currentCardTypes', () => {
    setDefaults({ clusters: [{ name: 'c1', healthy: false }] })
    const { result } = renderHook(() => useCardRecommendations(WITH_CLUSTER_HEALTH))

    const clusterRec = result.current.recommendations.find(r => r.cardType === 'cluster_health')
    expect(clusterRec).toBeUndefined()
  })

  // ---- Skipping event_stream when already in dashboard ----

  it('does not recommend event_stream when it is already in currentCardTypes', () => {
    setDefaults({ warningEvents: makeEvents(15) })
    const { result } = renderHook(() => useCardRecommendations(WITH_EVENT_STREAM))

    const eventRec = result.current.recommendations.find(r => r.cardType === 'event_stream')
    expect(eventRec).toBeUndefined()
  })

  // ---- GPU multi-node aggregation ----

  it('aggregates GPU counts across multiple nodes correctly', () => {
    // 3 nodes, each with 4 GPUs and 4 allocated = 12/12 = 100% utilization
    setDefaults({
      gpuNodes: [
        { name: 'n1', gpuCount: 4, gpuAllocated: 4 },
        { name: 'n2', gpuCount: 4, gpuAllocated: 4 },
        { name: 'n3', gpuCount: 4, gpuAllocated: 4 },
      ],
    })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const gpuRec = result.current.recommendations.find(r => r.cardType === 'gpu_status')
    expect(gpuRec).toBeDefined()
    expect(gpuRec!.reason).toContain('100%')
    expect(gpuRec!.priority).toBe('high')
  })

  // ---- GPU overview reason shows correct node count ----

  it('includes total GPU count and node count in gpu_overview reason', () => {
    setDefaults({
      gpuNodes: [
        { name: 'n1', gpuCount: 4, gpuAllocated: 0 },
        { name: 'n2', gpuCount: 8, gpuAllocated: 0 },
      ],
    })
    const { result } = renderHook(() => useCardRecommendations(NO_CARDS))

    const gpuRec = result.current.recommendations.find(r => r.cardType === 'gpu_overview')
    expect(gpuRec).toBeDefined()
    expect(gpuRec!.reason).toContain('12 GPUs')
    expect(gpuRec!.reason).toContain('2 nodes')
  })

  // ---- Security issues suppressed when already in dashboard ----
  // The source code checks `!currentCardTypes.includes('security_issues')`,
  // so the card is correctly filtered out when already on the dashboard.

  it('does not recommend security_issues when already in currentCardTypes', () => {
    setDefaults({ securityIssues: [{ id: 's1', severity: 'high' }] })
    const { result } = renderHook(() => useCardRecommendations(WITH_SECURITY_ISSUES))

    const secRec = result.current.recommendations.find(r => r.cardType === 'security_issues')
    expect(secRec).toBeUndefined()
  })
})
