import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const { cachedDataHooks, hookRegistry, mcpHooks, mcsHooks, mockUseDemoMode } = vi.hoisted(() => {
  const empty = () => ({ isLoading: false, error: null, refetch: vi.fn() })
  const resource = (field: string) => vi.fn().mockReturnValue({ [field]: [], ...empty() })

  return {
    cachedDataHooks: {
      useCachedPodIssues: resource('data'),
      useCachedEvents: resource('data'),
      useCachedDeployments: resource('data'),
      useCachedDeploymentIssues: resource('issues'),
      useCachedHPAs: resource('hpas'),
      useCachedReplicaSets: resource('replicasets'),
      useCachedStatefulSets: resource('statefulsets'),
      useCachedDaemonSets: resource('daemonsets'),
      useCachedCronJobs: resource('cronjobs'),
    },
    hookRegistry: new Map<string, (params?: Record<string, unknown>) => unknown>(),
    mcpHooks: {
      useClusters: resource('clusters'),
      usePVCs: resource('pvcs'),
      useServices: resource('services'),
      useOperators: resource('operators'),
      useHelmReleases: resource('releases'),
      useConfigMaps: resource('configmaps'),
      useSecrets: resource('secrets'),
      useIngresses: resource('ingresses'),
      useNodes: resource('nodes'),
      useJobs: resource('jobs'),
      useCronJobs: resource('cronJobs'),
      useStatefulSets: resource('statefulSets'),
      useDaemonSets: resource('daemonSets'),
      useHPAs: resource('hpas'),
      useReplicaSets: resource('replicaSets'),
      usePVs: resource('pvs'),
      useResourceQuotas: resource('resourceQuotas'),
      useLimitRanges: resource('limitRanges'),
      useNetworkPolicies: resource('networkpolicies'),
      useNamespaces: resource('namespaces'),
      useOperatorSubscriptions: resource('subscriptions'),
      useServiceAccounts: resource('serviceAccounts'),
      useK8sRoles: resource('roles'),
      useK8sRoleBindings: resource('bindings'),
    },
    mcsHooks: {
      useServiceExports: resource('exports'),
      useServiceImports: resource('imports'),
    },
    mockUseDemoMode: vi.fn().mockReturnValue({
      isDemoMode: false,
      toggleDemoMode: vi.fn(),
      setDemoMode: vi.fn(),
    }),
  }
})

const { proxyMocks } = vi.hoisted(() => ({
  proxyMocks: (hooks: Record<string, (...args: unknown[]) => unknown>) =>
    Object.fromEntries(Object.entries(hooks).map(([name, fn]) => [name, (...args: unknown[]) => fn(...args)])),
}))

const {
  useCachedDeploymentIssues: mockUseCachedDeploymentIssues,
  useCachedEvents: mockUseCachedEvents,
  useCachedPodIssues: mockUseCachedPodIssues,
} = cachedDataHooks
const {
  useClusters: mockUseClusters,
  useConfigMaps: mockUseConfigMaps,
  useNodes: mockUseNodes,
  useServices: mockUseServices,
} = mcpHooks

vi.mock('../card/hooks/useDataSource', () => ({
  registerDataHook: (name: string, fn: (params?: Record<string, unknown>) => unknown) => {
    hookRegistry.set(name, fn)
  },
}))

vi.mock('../../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useDemoMode')>()),
  useDemoMode: () => mockUseDemoMode(),
  getDemoMode: () => mockUseDemoMode().isDemoMode,
  isDemoModeForced: false,
}))

vi.mock('../../../hooks/useCachedData', () => proxyMocks(cachedDataHooks))
vi.mock('../../../hooks/mcp', () => proxyMocks(mcpHooks))
vi.mock('../../../hooks/useMCS', () => proxyMocks(mcsHooks))
vi.mock('@/lib/constants/network', async (importOriginal) => ({
  ...(await importOriginal() as Record<string, unknown>),
  SHORT_DELAY_MS: 15,
}))

import '../registerHooks'

interface UnifiedResult {
  data: unknown
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

function getHook(name: string) {
  const fn = hookRegistry.get(name)
  if (!fn) throw new Error('Hook "' + name + '" not found in registry')
  return fn as (params?: Record<string, unknown>) => UnifiedResult
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
})

afterEach(() => {
  vi.restoreAllMocks()
})
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
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const hook = getHook('useSecurityIssues')
    const { result } = renderHook(() => hook())
    expect(result.current.data).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('shows loading then demo data when in demo mode', () => {
    vi.useFakeTimers()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
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
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
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
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const hook = getHook('useTopPods')
    const { result, rerender } = renderHook(() => hook())

    // In non-demo mode: no data
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.data).toEqual([])

    // Switch to demo mode
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
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
