import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

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
  useDaemonSets: mockUseDaemonSets,
  useHPAs: mockUseHPAs,
  useHelmReleases: mockUseHelmReleases,
  useIngresses: mockUseIngresses,
  useK8sRoleBindings: mockUseK8sRoleBindings,
  useK8sRoles: mockUseK8sRoles,
  useLimitRanges: mockUseLimitRanges,
  useNamespaces: mockUseNamespaces,
  useNetworkPolicies: mockUseNetworkPolicies,
  useOperatorSubscriptions: mockUseOperatorSubscriptions,
  usePVs: mockUsePVs,
  useReplicaSets: mockUseReplicaSets,
  useResourceQuotas: mockUseResourceQuotas,
  useSecrets: mockUseSecrets,
  useStatefulSets: mockUseStatefulSets,
} = mcpHooks
const {
  useServiceExports: mockUseServiceExports,
  useServiceImports: mockUseServiceImports,
} = mcsHooks

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

// ============================================================================
// 18. MCS hooks: ServiceExports, ServiceImports

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

  it('useUnifiedStatefulSets maps statefulSets to data', () => {
    mockUseStatefulSets.mockReturnValue({
      statefulSets: [{ name: 'ss1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const hook = getHook('useStatefulSets')
    const { result } = renderHook(() => hook({ cluster: 'c', namespace: 'n' }))
    expect(result.current.data).toEqual([{ name: 'ss1' }])
  })

  it('useUnifiedDaemonSets maps daemonSets to data', () => {
    mockUseDaemonSets.mockReturnValue({
      daemonSets: [{ name: 'ds1' }],
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

  it('useUnifiedReplicaSets maps replicaSets to data', () => {
    mockUseReplicaSets.mockReturnValue({
      replicaSets: [{ name: 'rs1' }],
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
