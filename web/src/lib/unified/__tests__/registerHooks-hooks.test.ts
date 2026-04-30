/**
 * registerHooks-hooks.test.ts
 *
 * Exercises the *actual* registered wrapper hooks via renderHook,
 * covering uncovered statement branches in registerHooks.ts:
 *
 * - Each useUnified* wrapper: params extraction, field mapping,
 *   error wrapping (string -> Error, null -> null), refetch delegation
 * - useDemoDataHook: real React lifecycle via renderHook (demo on/off,
 *   loading timer, cleanup, empty data)
 * - useWarningEvents / useRecentEvents / useNamespaceEvents:
 *   actual hook rendering with data filtering
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks — the hook registry captures registered functions
// ---------------------------------------------------------------------------

const {
  mockUseDemoMode,
  mockUseCachedPodIssues,
  mockUseCachedEvents,
  mockUseCachedDeployments,
  mockUseCachedDeploymentIssues,
  mockUseClusters,
  mockUsePVCs,
  mockUseServices,
  mockUseOperators,
  mockUseHelmReleases,
  mockUseConfigMaps,
  mockUseSecrets,
  mockUseIngresses,
  mockUseNodes,
  mockUseJobs,
  mockUseCronJobs,
  mockUseStatefulSets,
  mockUseDaemonSets,
  mockUseHPAs,
  mockUseReplicaSets,
  mockUsePVs,
  mockUseResourceQuotas,
  mockUseLimitRanges,
  mockUseNetworkPolicies,
  mockUseNamespaces,
  mockUseOperatorSubscriptions,
  mockUseServiceAccounts,
  mockUseK8sRoles,
  mockUseK8sRoleBindings,
  mockUseServiceExports,
  mockUseServiceImports,
  hookRegistry,
} = vi.hoisted(() => {
  const registry = new Map<string, (params?: Record<string, unknown>) => unknown>()
  return {
    mockUseDemoMode: vi.fn().mockReturnValue({ isDemoMode: false }),
    mockUseCachedPodIssues: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseCachedEvents: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseCachedDeployments: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseCachedDeploymentIssues: vi.fn().mockReturnValue({ issues: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseClusters: vi.fn().mockReturnValue({ clusters: [], deduplicatedClusters: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUsePVCs: vi.fn().mockReturnValue({ pvcs: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseServices: vi.fn().mockReturnValue({ services: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseOperators: vi.fn().mockReturnValue({ operators: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseHelmReleases: vi.fn().mockReturnValue({ releases: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseConfigMaps: vi.fn().mockReturnValue({ configmaps: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseSecrets: vi.fn().mockReturnValue({ secrets: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseIngresses: vi.fn().mockReturnValue({ ingresses: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseNodes: vi.fn().mockReturnValue({ nodes: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseJobs: vi.fn().mockReturnValue({ jobs: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseCronJobs: vi.fn().mockReturnValue({ cronjobs: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseStatefulSets: vi.fn().mockReturnValue({ statefulsets: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseDaemonSets: vi.fn().mockReturnValue({ daemonsets: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseHPAs: vi.fn().mockReturnValue({ hpas: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseReplicaSets: vi.fn().mockReturnValue({ replicasets: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUsePVs: vi.fn().mockReturnValue({ pvs: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseResourceQuotas: vi.fn().mockReturnValue({ resourceQuotas: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseLimitRanges: vi.fn().mockReturnValue({ limitRanges: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseNetworkPolicies: vi.fn().mockReturnValue({ networkpolicies: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseNamespaces: vi.fn().mockReturnValue({ namespaces: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseOperatorSubscriptions: vi.fn().mockReturnValue({ subscriptions: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseServiceAccounts: vi.fn().mockReturnValue({ serviceAccounts: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseK8sRoles: vi.fn().mockReturnValue({ roles: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseK8sRoleBindings: vi.fn().mockReturnValue({ bindings: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseServiceExports: vi.fn().mockReturnValue({ exports: [], isLoading: false, error: null, refetch: vi.fn() }),
    mockUseServiceImports: vi.fn().mockReturnValue({ imports: [], isLoading: false, error: null, refetch: vi.fn() }),
    hookRegistry: registry,
  }
})

// Capture every registered hook so we can call them in tests
vi.mock('../card/hooks/useDataSource', () => ({
  registerDataHook: (name: string, fn: (params?: Record<string, unknown>) => unknown) => {
    hookRegistry.set(name, fn)
  },
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
  getDemoMode: () => mockUseDemoMode().isDemoMode,
  isDemoModeForced: false,
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedPodIssues: (...a: unknown[]) => mockUseCachedPodIssues(...a),
  useCachedEvents: (...a: unknown[]) => mockUseCachedEvents(...a),
  useCachedDeployments: (...a: unknown[]) => mockUseCachedDeployments(...a),
  useCachedDeploymentIssues: (...a: unknown[]) => mockUseCachedDeploymentIssues(...a),
}))

vi.mock('../../../hooks/mcp', () => ({
  useClusters: (...a: unknown[]) => mockUseClusters(...a),
  usePVCs: (...a: unknown[]) => mockUsePVCs(...a),
  useServices: (...a: unknown[]) => mockUseServices(...a),
  useOperators: (...a: unknown[]) => mockUseOperators(...a),
  useHelmReleases: (...a: unknown[]) => mockUseHelmReleases(...a),
  useConfigMaps: (...a: unknown[]) => mockUseConfigMaps(...a),
  useSecrets: (...a: unknown[]) => mockUseSecrets(...a),
  useIngresses: (...a: unknown[]) => mockUseIngresses(...a),
  useNodes: (...a: unknown[]) => mockUseNodes(...a),
  useJobs: (...a: unknown[]) => mockUseJobs(...a),
  useCronJobs: (...a: unknown[]) => mockUseCronJobs(...a),
  useStatefulSets: (...a: unknown[]) => mockUseStatefulSets(...a),
  useDaemonSets: (...a: unknown[]) => mockUseDaemonSets(...a),
  useHPAs: (...a: unknown[]) => mockUseHPAs(...a),
  useReplicaSets: (...a: unknown[]) => mockUseReplicaSets(...a),
  usePVs: (...a: unknown[]) => mockUsePVs(...a),
  useResourceQuotas: (...a: unknown[]) => mockUseResourceQuotas(...a),
  useLimitRanges: (...a: unknown[]) => mockUseLimitRanges(...a),
  useNetworkPolicies: (...a: unknown[]) => mockUseNetworkPolicies(...a),
  useNamespaces: (...a: unknown[]) => mockUseNamespaces(...a),
  useOperatorSubscriptions: (...a: unknown[]) => mockUseOperatorSubscriptions(...a),
  useServiceAccounts: (...a: unknown[]) => mockUseServiceAccounts(...a),
  useK8sRoles: (...a: unknown[]) => mockUseK8sRoles(...a),
  useK8sRoleBindings: (...a: unknown[]) => mockUseK8sRoleBindings(...a),
}))

vi.mock('../../../hooks/useMCS', () => ({
  useServiceExports: (...a: unknown[]) => mockUseServiceExports(...a),
  useServiceImports: (...a: unknown[]) => mockUseServiceImports(...a),
}))

vi.mock('../../constants/network', () => ({
  SHORT_DELAY_MS: 15,
}))

// Import triggers auto-registration, populating hookRegistry
import '../registerHooks'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

interface UnifiedResult {
  data: unknown
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

function getHook(name: string) {
  const fn = hookRegistry.get(name)
  if (!fn) throw new Error(`Hook "${name}" not found in registry`)
  return fn as (params?: Record<string, unknown>) => UnifiedResult
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// 1-2. useUnifiedPodIssues — params forwarding & error wrapping
// ============================================================================

describe('useUnifiedPodIssues via renderHook', () => {
  it('forwards cluster and namespace params to useCachedPodIssues', () => {
    const hook = getHook('useCachedPodIssues')
    renderHook(() => hook({ cluster: 'prod', namespace: 'apps' }))
    expect(mockUseCachedPodIssues).toHaveBeenCalledWith('prod', 'apps')
  })

  it('wraps string error into Error object', () => {
    mockUseCachedPodIssues.mockReturnValue({ data: [], isLoading: false, error: 'timeout', refetch: vi.fn() })
    const hook = getHook('useCachedPodIssues')
    const { result } = renderHook(() => hook())
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error!.message).toBe('timeout')
  })

  it('returns null error when underlying has no error', () => {
    mockUseCachedPodIssues.mockReturnValue({ data: [{ id: 1 }], isLoading: false, error: null, refetch: vi.fn() })
    const hook = getHook('useCachedPodIssues')
    const { result } = renderHook(() => hook())
    expect(result.current.error).toBeNull()
    expect(result.current.data).toEqual([{ id: 1 }])
  })
})

// ============================================================================
// 3. useUnifiedClusters — maps 'clusters' to 'data'
// ============================================================================

describe('useUnifiedClusters via renderHook', () => {
  it('maps clusters to data and wraps error', () => {
    mockUseClusters.mockReturnValue({
      clusters: [{ name: 'c1' }],
      deduplicatedClusters: [{ name: 'c1' }],
      isLoading: true,
      error: 'cluster err',
      refetch: vi.fn(),
    })
    const hook = getHook('useClusters')
    const { result } = renderHook(() => hook())
    expect(result.current.data).toEqual([{ name: 'c1' }])
    expect(result.current.isLoading).toBe(true)
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error!.message).toBe('cluster err')
  })
})

// ============================================================================
// 4. useUnifiedDeploymentIssues — issues || [] fallback
// ============================================================================

describe('useUnifiedDeploymentIssues via renderHook', () => {
  it('returns issues when present', () => {
    mockUseCachedDeploymentIssues.mockReturnValue({
      issues: [{ id: 'i1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useCachedDeploymentIssues')
    const { result } = renderHook(() => hook({ cluster: 'c1' }))
    expect(result.current.data).toEqual([{ id: 'i1' }])
  })

  it('falls back to empty array when issues is undefined', () => {
    mockUseCachedDeploymentIssues.mockReturnValue({
      issues: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useCachedDeploymentIssues')
    const { result } = renderHook(() => hook())
    expect(result.current.data).toEqual([])
  })
})

// ============================================================================
// 5-6. Two-param wrapper hooks: Services, ConfigMaps
// ============================================================================

describe('useUnifiedServices via renderHook', () => {
  it('forwards params and maps services to data', () => {
    mockUseServices.mockReturnValue({
      services: [{ name: 'svc1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useServices')
    const { result } = renderHook(() => hook({ cluster: 'stg', namespace: 'kube-system' }))
    expect(mockUseServices).toHaveBeenCalledWith('stg', 'kube-system')
    expect(result.current.data).toEqual([{ name: 'svc1' }])
  })
})

describe('useUnifiedConfigMaps via renderHook', () => {
  it('maps configmaps to data', () => {
    mockUseConfigMaps.mockReturnValue({
      configmaps: [{ name: 'cm1' }],
      isLoading: false,
      error: 'err',
      refetch: vi.fn(),
    })
    const hook = getHook('useConfigMaps')
    const { result } = renderHook(() => hook({ cluster: 'dev', namespace: 'ns1' }))
    expect(mockUseConfigMaps).toHaveBeenCalledWith('dev', 'ns1')
    expect(result.current.data).toEqual([{ name: 'cm1' }])
    expect(result.current.error).toBeInstanceOf(Error)
  })
})

// ============================================================================
// 7. Cluster-only wrapper hook: Nodes
// ============================================================================

describe('useUnifiedNodes via renderHook', () => {
  it('forwards only cluster param', () => {
    mockUseNodes.mockReturnValue({
      nodes: [{ name: 'n1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useNodes')
    const { result } = renderHook(() => hook({ cluster: 'gpu' }))
    expect(mockUseNodes).toHaveBeenCalledWith('gpu')
    expect(result.current.data).toEqual([{ name: 'n1' }])
  })
})

// ============================================================================
// 8. Refetch wrapper delegates correctly
// ============================================================================

describe('refetch delegation', () => {
  it('useCachedEvents refetch wrapper calls underlying', () => {
    const innerRefetch = vi.fn()
    mockUseCachedEvents.mockReturnValue({ data: [], isLoading: false, error: null, refetch: innerRefetch })
    const hook = getHook('useCachedEvents')
    const { result } = renderHook(() => hook())
    result.current.refetch()
    expect(innerRefetch).toHaveBeenCalledTimes(1)
  })
})

// ============================================================================
// 9-10. useWarningEvents — actual hook filter via renderHook
// ============================================================================

describe('useWarningEvents via renderHook', () => {
  it('filters to Warning events only', () => {
    mockUseCachedEvents.mockReturnValue({
      data: [
        { type: 'Normal', message: 'ok' },
        { type: 'Warning', message: 'bad' },
        { type: 'Warning', message: 'worse' },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useWarningEvents')
    const { result } = renderHook(() => hook())
    const data = result.current.data as Array<{ type: string }>
    expect(data).toHaveLength(2)
    expect(data.every(e => e.type === 'Warning')).toBe(true)
  })

  it('returns empty array when data is null', () => {
    mockUseCachedEvents.mockReturnValue({ data: null, isLoading: false, error: null, refetch: vi.fn() })
    const hook = getHook('useWarningEvents')
    const { result } = renderHook(() => hook())
    expect(result.current.data).toEqual([])
  })
})

// ============================================================================
// 11-12. useRecentEvents — actual hook filter via renderHook
// ============================================================================

describe('useRecentEvents via renderHook', () => {
  it('filters to events within last hour', () => {
    const now = Date.now()
    const THIRTY_MIN_MS = 30 * 60 * 1000
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000
    mockUseCachedEvents.mockReturnValue({
      data: [
        { lastSeen: new Date(now - THIRTY_MIN_MS).toISOString(), message: 'recent' },
        { lastSeen: new Date(now - TWO_HOURS_MS).toISOString(), message: 'old' },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useRecentEvents')
    const { result } = renderHook(() => hook())
    const data = result.current.data as Array<{ message: string }>
    expect(data).toHaveLength(1)
    expect(data[0].message).toBe('recent')
  })

  it('excludes events without lastSeen', () => {
    const now = Date.now()
    const FIVE_MIN_MS = 5 * 60 * 1000
    mockUseCachedEvents.mockReturnValue({
      data: [
        { lastSeen: new Date(now - FIVE_MIN_MS).toISOString(), message: 'has time' },
        { lastSeen: undefined, message: 'no time' },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useRecentEvents')
    const { result } = renderHook(() => hook())
    const data = result.current.data as Array<{ message: string }>
    expect(data).toHaveLength(1)
    expect(data[0].message).toBe('has time')
  })
})

// ============================================================================
// 13-14. useNamespaceEvents — namespace filtering + fallback
// ============================================================================

describe('useNamespaceEvents via renderHook', () => {
  it('filters events by namespace when provided', () => {
    mockUseCachedEvents.mockReturnValue({
      data: [
        { namespace: 'prod', type: 'Normal', message: 'e1' },
        { namespace: 'stg', type: 'Warning', message: 'e2' },
        { namespace: 'prod', type: 'Normal', message: 'e3' },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useNamespaceEvents')
    const { result } = renderHook(() => hook({ namespace: 'prod' }))
    const data = result.current.data as Array<{ namespace: string }>
    expect(data).toHaveLength(2)
    expect(data.every(e => e.namespace === 'prod')).toBe(true)
  })

  it('falls back to demo data when filtered result is empty', () => {
    mockUseCachedEvents.mockReturnValue({
      data: [{ namespace: 'other', type: 'Normal', message: 'e1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useNamespaceEvents')
    const { result } = renderHook(() => hook({ namespace: 'nonexistent' }))
    const data = result.current.data as unknown[]
    // DEMO_NAMESPACE_EVENTS has 2 items
    expect(data).toHaveLength(2)
  })

  it('limits to 20 events when no namespace filter is set', () => {
    const THIRTY_EVENTS = 30
    const events = Array.from({ length: THIRTY_EVENTS }, (_, i) => ({
      namespace: `ns-${i}`, type: 'Normal', message: `e-${i}`,
    }))
    mockUseCachedEvents.mockReturnValue({
      data: events,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useNamespaceEvents')
    const { result } = renderHook(() => hook())
    const data = result.current.data as unknown[]
    const MAX_UNFILTERED = 20
    expect(data).toHaveLength(MAX_UNFILTERED)
  })
})

// ============================================================================
// 15-17. useDemoDataHook — real React lifecycle
// ============================================================================

describe('useDemoDataHook via registered demo hooks', () => {
  it('returns empty data when not in demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
    const hook = getHook('useSecurityIssues')
    const { result } = renderHook(() => hook())
    expect(result.current.data).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('shows loading then demo data when in demo mode', () => {
    vi.useFakeTimers()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    const hook = getHook('useSecurityIssues')
    const { result } = renderHook(() => hook())

    // Initially loading
    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toEqual([])

    // After SHORT_DELAY_MS (15ms), should have data
    act(() => { vi.advanceTimersByTime(20) })
    expect(result.current.isLoading).toBe(false)
    const data = result.current.data as unknown[]
    expect(data.length).toBeGreaterThan(0)

    vi.useRealTimers()
  })

  it('cleans up timer on unmount during loading', () => {
    vi.useFakeTimers()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    const hook = getHook('useActiveAlerts')
    const { unmount } = renderHook(() => hook())

    // Unmount while still loading
    unmount()
    // Should not throw when timer fires
    act(() => { vi.advanceTimersByTime(20) })

    vi.useRealTimers()
  })

  it('transitions from non-demo to demo mode', () => {
    vi.useFakeTimers()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
    const hook = getHook('useTopPods')
    const { result, rerender } = renderHook(() => hook())

    // In non-demo mode: no data
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.data).toEqual([])

    // Switch to demo mode
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    rerender()

    // Should be loading
    expect(result.current.isLoading).toBe(true)

    // After timer, data available
    act(() => { vi.advanceTimersByTime(20) })
    expect(result.current.isLoading).toBe(false)
    const data = result.current.data as unknown[]
    expect(data.length).toBeGreaterThan(0)

    vi.useRealTimers()
  })
})

// ============================================================================
// 18. MCS hooks: ServiceExports, ServiceImports
// ============================================================================

describe('MCS wrapper hooks via renderHook', () => {
  it('useServiceExports maps exports to data', () => {
    mockUseServiceExports.mockReturnValue({
      exports: [{ name: 'exp1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useServiceExports')
    const { result } = renderHook(() => hook({ cluster: 'c1', namespace: 'ns1' }))
    expect(mockUseServiceExports).toHaveBeenCalledWith('c1', 'ns1')
    expect(result.current.data).toEqual([{ name: 'exp1' }])
  })

  it('useServiceImports maps imports to data', () => {
    mockUseServiceImports.mockReturnValue({
      imports: [{ name: 'imp1' }],
      isLoading: false,
      error: 'import err',
      refetch: vi.fn(),
    })
    const hook = getHook('useServiceImports')
    const { result } = renderHook(() => hook({ cluster: 'c2', namespace: 'ns2' }))
    expect(result.current.data).toEqual([{ name: 'imp1' }])
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error!.message).toBe('import err')
  })
})

// ============================================================================
// 19-20. Additional wrapper hooks coverage (resource-specific field mapping)
// ============================================================================

describe('additional resource wrapper hooks', () => {
  it('useUnifiedHelmReleases maps releases to data', () => {
    mockUseHelmReleases.mockReturnValue({
      releases: [{ name: 'r1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useHelmReleases')
    const { result } = renderHook(() => hook({ cluster: 'prod' }))
    expect(mockUseHelmReleases).toHaveBeenCalledWith('prod')
    expect(result.current.data).toEqual([{ name: 'r1' }])
  })

  it('useUnifiedSecrets maps secrets to data with error', () => {
    mockUseSecrets.mockReturnValue({
      secrets: [{ name: 's1' }],
      isLoading: false,
      error: 'forbidden',
      refetch: vi.fn(),
    })
    const hook = getHook('useSecrets')
    const { result } = renderHook(() => hook({ cluster: 'c', namespace: 'n' }))
    expect(result.current.data).toEqual([{ name: 's1' }])
    expect(result.current.error!.message).toBe('forbidden')
  })

  it('useUnifiedIngresses maps ingresses to data', () => {
    mockUseIngresses.mockReturnValue({
      ingresses: [{ name: 'ing1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useIngresses')
    const { result } = renderHook(() => hook({ cluster: 'c', namespace: 'n' }))
    expect(result.current.data).toEqual([{ name: 'ing1' }])
  })

  // Issue 9357: useUnifiedIngresses must propagate isDemoFallback as
  // isDemoData so UnifiedCard can suppress the Demo badge on live data.
  it('useUnifiedIngresses propagates isDemoFallback as isDemoData', () => {
    mockUseIngresses.mockReturnValue({
      ingresses: [{ name: 'demo-ing' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isDemoFallback: true,
    })
    const hook = getHook('useIngresses')
    const { result } = renderHook(() => hook({ cluster: 'c', namespace: 'n' }))
    expect(result.current.isDemoData).toBe(true)
  })

  it('useUnifiedIngresses reports isDemoData: false when live', () => {
    mockUseIngresses.mockReturnValue({
      ingresses: [{ name: 'live-ing' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isDemoFallback: false,
    })
    const hook = getHook('useIngresses')
    const { result } = renderHook(() => hook({ cluster: 'c', namespace: 'n' }))
    expect(result.current.isDemoData).toBe(false)
  })

  it('useUnifiedStatefulSets maps statefulsets to data', () => {
    mockUseStatefulSets.mockReturnValue({
      statefulsets: [{ name: 'ss1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useStatefulSets')
    const { result } = renderHook(() => hook({ cluster: 'c', namespace: 'n' }))
    expect(result.current.data).toEqual([{ name: 'ss1' }])
  })

  it('useUnifiedDaemonSets maps daemonsets to data', () => {
    mockUseDaemonSets.mockReturnValue({
      daemonsets: [{ name: 'ds1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useDaemonSets')
    const { result } = renderHook(() => hook({ cluster: 'c', namespace: 'n' }))
    expect(result.current.data).toEqual([{ name: 'ds1' }])
  })

  it('useUnifiedHPAs maps hpas to data', () => {
    mockUseHPAs.mockReturnValue({
      hpas: [{ name: 'hpa1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useHPAs')
    const { result } = renderHook(() => hook({ cluster: 'c', namespace: 'n' }))
    expect(result.current.data).toEqual([{ name: 'hpa1' }])
  })

  it('useUnifiedReplicaSets maps replicasets to data', () => {
    mockUseReplicaSets.mockReturnValue({
      replicasets: [{ name: 'rs1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useReplicaSets')
    const { result } = renderHook(() => hook({ cluster: 'c', namespace: 'n' }))
    expect(result.current.data).toEqual([{ name: 'rs1' }])
  })

  it('useUnifiedPVs maps pvs to data', () => {
    mockUsePVs.mockReturnValue({
      pvs: [{ name: 'pv1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('usePVs')
    const { result } = renderHook(() => hook({ cluster: 'c' }))
    expect(mockUsePVs).toHaveBeenCalledWith('c')
    expect(result.current.data).toEqual([{ name: 'pv1' }])
  })

  it('useUnifiedResourceQuotas maps resourceQuotas to data', () => {
    mockUseResourceQuotas.mockReturnValue({
      resourceQuotas: [{ name: 'rq1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useResourceQuotas')
    const { result } = renderHook(() => hook({ cluster: 'c', namespace: 'n' }))
    expect(result.current.data).toEqual([{ name: 'rq1' }])
  })

  // Issue 9356: useUnifiedResourceQuotas must propagate isDemoFallback as
  // isDemoData so UnifiedCard can suppress the Demo badge on live data.
  it('useUnifiedResourceQuotas propagates isDemoFallback as isDemoData', () => {
    mockUseResourceQuotas.mockReturnValue({
      resourceQuotas: [{ name: 'demo-rq' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isDemoFallback: true,
    })
    const hook = getHook('useResourceQuotas')
    const { result } = renderHook(() => hook({ cluster: 'c', namespace: 'n' }))
    expect(result.current.isDemoData).toBe(true)
  })

  it('useUnifiedResourceQuotas reports isDemoData: false when live', () => {
    mockUseResourceQuotas.mockReturnValue({
      resourceQuotas: [{ name: 'live-rq' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isDemoFallback: false,
    })
    const hook = getHook('useResourceQuotas')
    const { result } = renderHook(() => hook({ cluster: 'c', namespace: 'n' }))
    expect(result.current.isDemoData).toBe(false)
  })

  it('useUnifiedLimitRanges maps limitRanges to data', () => {
    mockUseLimitRanges.mockReturnValue({
      limitRanges: [{ name: 'lr1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useLimitRanges')
    const { result } = renderHook(() => hook({ cluster: 'c', namespace: 'n' }))
    expect(result.current.data).toEqual([{ name: 'lr1' }])
  })

  it('useUnifiedNetworkPolicies maps networkpolicies to data', () => {
    mockUseNetworkPolicies.mockReturnValue({
      networkpolicies: [{ name: 'np1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useNetworkPolicies')
    const { result } = renderHook(() => hook({ cluster: 'c', namespace: 'n' }))
    expect(result.current.data).toEqual([{ name: 'np1' }])
  })

  it('useUnifiedNamespaces maps namespaces to data', () => {
    mockUseNamespaces.mockReturnValue({
      namespaces: [{ name: 'ns1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useNamespaces')
    const { result } = renderHook(() => hook({ cluster: 'c' }))
    expect(mockUseNamespaces).toHaveBeenCalledWith('c')
    expect(result.current.data).toEqual([{ name: 'ns1' }])
  })

  it('useUnifiedOperatorSubscriptions maps subscriptions to data', () => {
    mockUseOperatorSubscriptions.mockReturnValue({
      subscriptions: [{ name: 'sub1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useOperatorSubscriptions')
    const { result } = renderHook(() => hook({ cluster: 'ocp' }))
    expect(result.current.data).toEqual([{ name: 'sub1' }])
  })

  it('useUnifiedK8sRoles maps roles to data', () => {
    mockUseK8sRoles.mockReturnValue({
      roles: [{ name: 'role1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useK8sRoles')
    const { result } = renderHook(() => hook({ cluster: 'c', namespace: 'n' }))
    expect(result.current.data).toEqual([{ name: 'role1' }])
  })

  it('useUnifiedK8sRoleBindings maps bindings to data', () => {
    mockUseK8sRoleBindings.mockReturnValue({
      bindings: [{ name: 'rb1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useK8sRoleBindings')
    const { result } = renderHook(() => hook({ cluster: 'c', namespace: 'n' }))
    expect(result.current.data).toEqual([{ name: 'rb1' }])
  })
})
