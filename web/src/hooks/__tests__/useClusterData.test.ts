/**
 * Tests for the useClusterData hook.
 *
 * Validates aggregation of multiple MCP hooks, coalescing of undefined
 * upstream values to empty arrays, and exposure of deduplicatedClusters.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — must be declared before the module under test is imported.
// Each MCP hook returns an object with a specific property name.
// ---------------------------------------------------------------------------

const mockUseClusters = vi.fn()
const mockUseAllPods = vi.fn()
const mockUseDeployments = vi.fn()
const mockUseNamespaces = vi.fn()
const mockUseEvents = vi.fn()
const mockUseWarningEvents = vi.fn()
const mockUseHelmReleases = vi.fn()
const mockUseOperatorSubscriptions = vi.fn()
const mockUseSecurityIssues = vi.fn()

vi.mock('../useMCP', () => ({
  useClusters: (...args: unknown[]) => mockUseClusters(...args),
  useAllPods: (...args: unknown[]) => mockUseAllPods(...args),
  useDeployments: (...args: unknown[]) => mockUseDeployments(...args),
  useNamespaces: (...args: unknown[]) => mockUseNamespaces(...args),
  useEvents: (...args: unknown[]) => mockUseEvents(...args),
  useWarningEvents: (...args: unknown[]) => mockUseWarningEvents(...args),
  useHelmReleases: (...args: unknown[]) => mockUseHelmReleases(...args),
  useOperatorSubscriptions: (...args: unknown[]) => mockUseOperatorSubscriptions(...args),
  useSecurityIssues: (...args: unknown[]) => mockUseSecurityIssues(...args),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Set all mocks to return the given shape (or defaults). */
function setDefaults(overrides: Record<string, unknown> = {}) {
  mockUseClusters.mockReturnValue({
    clusters: overrides.clusters ?? [{ name: 'c1' }],
    deduplicatedClusters: overrides.deduplicatedClusters ?? [{ name: 'c1' }],
  })
  mockUseAllPods.mockReturnValue({ pods: overrides.pods ?? [{ name: 'p1' }] })
  mockUseDeployments.mockReturnValue({ deployments: overrides.deployments ?? [{ name: 'd1' }] })
  mockUseNamespaces.mockReturnValue({ namespaces: overrides.namespaces ?? [{ name: 'ns1' }] })
  mockUseEvents.mockReturnValue({ events: overrides.events ?? [{ reason: 'Scheduled' }] })
  mockUseWarningEvents.mockReturnValue({ events: overrides.warningEvents ?? [{ reason: 'BackOff', type: 'Warning' }] })
  mockUseHelmReleases.mockReturnValue({ releases: overrides.releases ?? [{ name: 'h1' }] })
  mockUseOperatorSubscriptions.mockReturnValue({ subscriptions: overrides.subscriptions ?? [{ name: 'o1' }] })
  mockUseSecurityIssues.mockReturnValue({ issues: overrides.issues ?? [{ id: 's1' }] })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useClusterData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setDefaults()
  })

  // 1. Returns expected properties from upstream hooks
  it('returns all aggregated properties from upstream MCP hooks', async () => {
    const { useClusterData } = await import('../useClusterData')
    const { result } = renderHook(() => useClusterData())

    expect(result.current.clusters).toEqual([{ name: 'c1' }])
    expect(result.current.deduplicatedClusters).toEqual([{ name: 'c1' }])
    expect(result.current.pods).toEqual([{ name: 'p1' }])
    expect(result.current.deployments).toEqual([{ name: 'd1' }])
    expect(result.current.namespaces).toEqual([{ name: 'ns1' }])
    expect(result.current.events).toEqual([{ reason: 'Scheduled' }])
    expect(result.current.warningEvents).toEqual([{ reason: 'BackOff', type: 'Warning' }])
    expect(result.current.helmReleases).toEqual([{ name: 'h1' }])
    expect(mockUseWarningEvents).toHaveBeenCalledWith(undefined, undefined, 100)
    expect(result.current.operatorSubscriptions).toEqual([{ name: 'o1' }])
    expect(result.current.securityIssues).toEqual([{ id: 's1' }])
  })

  // 2. Coalesces undefined upstream values to empty arrays
  it('coalesces undefined upstream values to empty arrays', async () => {
    mockUseClusters.mockReturnValue({ clusters: undefined, deduplicatedClusters: undefined })
    mockUseAllPods.mockReturnValue({ pods: undefined })
    mockUseDeployments.mockReturnValue({ deployments: undefined })
    mockUseNamespaces.mockReturnValue({ namespaces: undefined })
    mockUseEvents.mockReturnValue({ events: undefined })
    mockUseWarningEvents.mockReturnValue({ events: undefined })
    mockUseHelmReleases.mockReturnValue({ releases: undefined })
    mockUseOperatorSubscriptions.mockReturnValue({ subscriptions: undefined })
    mockUseSecurityIssues.mockReturnValue({ issues: undefined })

    const { useClusterData } = await import('../useClusterData')
    const { result } = renderHook(() => useClusterData())

    expect(result.current.clusters).toEqual([])
    expect(result.current.deduplicatedClusters).toEqual([])
    expect(result.current.pods).toEqual([])
    expect(result.current.deployments).toEqual([])
    expect(result.current.namespaces).toEqual([])
    expect(result.current.events).toEqual([])
    expect(result.current.warningEvents).toEqual([])
    expect(result.current.helmReleases).toEqual([])
    expect(result.current.operatorSubscriptions).toEqual([])
    expect(result.current.securityIssues).toEqual([])
  })

  // 3. Returns deduplicatedClusters from useClusters
  it('returns deduplicatedClusters when provided by useClusters', async () => {
    const deduped = [{ name: 'unique-cluster' }]
    mockUseClusters.mockReturnValue({
      clusters: [{ name: 'c1' }, { name: 'c1' }],
      deduplicatedClusters: deduped,
    })

    const { useClusterData } = await import('../useClusterData')
    const { result } = renderHook(() => useClusterData())

    expect(result.current.deduplicatedClusters).toEqual(deduped)
    expect(result.current.clusters).toHaveLength(2)
  })

  // 4. Mixed defined and undefined inputs
  it('handles mixed defined and undefined upstream values', async () => {
    mockUseAllPods.mockReturnValue({ pods: undefined })
    mockUseEvents.mockReturnValue({ events: undefined })
    mockUseWarningEvents.mockReturnValue({ events: undefined })
    // Rest keep their defaults from setDefaults()

    const { useClusterData } = await import('../useClusterData')
    const { result } = renderHook(() => useClusterData())

    // Defined values pass through
    expect(result.current.clusters).toEqual([{ name: 'c1' }])
    expect(result.current.deployments).toEqual([{ name: 'd1' }])

    // Undefined values coalesced
    expect(result.current.pods).toEqual([])
    expect(result.current.events).toEqual([])
    expect(result.current.warningEvents).toEqual([])
  })

  // 5. Issue 9353 — podClusterErrors forwarded from useAllPods
  it('forwards podClusterErrors from useAllPods so the drill-down can distinguish RBAC vs transient failures', async () => {
    const clusterErrors = [
      { cluster: 'prod-east', errorType: 'auth', message: 'pods is forbidden' },
      { cluster: 'prod-west', errorType: 'timeout', message: 'context deadline exceeded' },
    ]
    mockUseAllPods.mockReturnValue({ pods: [], clusterErrors })

    const { useClusterData } = await import('../useClusterData')
    const { result } = renderHook(() => useClusterData())

    expect(result.current.podClusterErrors).toEqual(clusterErrors)
  })

  // 6. Issue 9353 — podClusterErrors coalesces to [] when useAllPods omits it
  it('coalesces podClusterErrors to empty array when useAllPods does not provide one', async () => {
    mockUseAllPods.mockReturnValue({ pods: [] })

    const { useClusterData } = await import('../useClusterData')
    const { result } = renderHook(() => useClusterData())

    expect(result.current.podClusterErrors).toEqual([])
  })
})
