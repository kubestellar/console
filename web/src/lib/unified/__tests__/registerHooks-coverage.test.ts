/**
 * Coverage-focused tests for registerHooks.ts
 *
 * Exercises the remaining uncovered wrapper hooks via renderHook
 * through the real hook registry (getDataHook). Focuses on:
 * - Real-data wrappers not covered by registerHooks-hooks.test.ts
 *   (useOperators, usePVCs, useJobs, useCronJobs, useCachedDeployments, useServiceAccounts)
 * - Demo data hooks (batch 4/5/6) via useDemoDataHook lifecycle
 * - Error wrapping and param forwarding for each wrapper
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
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
  mockUseDemoMode,
} = vi.hoisted(() => ({
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
  mockUseDemoMode: vi.fn().mockReturnValue({ isDemoMode: false }),
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
  getDemoMode: () => false,
  isDemoModeForced: false,
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedPodIssues: (...args: unknown[]) => mockUseCachedPodIssues(...args),
  useCachedEvents: (...args: unknown[]) => mockUseCachedEvents(...args),
  useCachedDeployments: (...args: unknown[]) => mockUseCachedDeployments(...args),
  useCachedDeploymentIssues: (...args: unknown[]) => mockUseCachedDeploymentIssues(...args),
}))

vi.mock('../../../hooks/mcp', () => ({
  useClusters: (...args: unknown[]) => mockUseClusters(...args),
  usePVCs: (...args: unknown[]) => mockUsePVCs(...args),
  useServices: (...args: unknown[]) => mockUseServices(...args),
  useOperators: (...args: unknown[]) => mockUseOperators(...args),
  useHelmReleases: (...args: unknown[]) => mockUseHelmReleases(...args),
  useConfigMaps: (...args: unknown[]) => mockUseConfigMaps(...args),
  useSecrets: (...args: unknown[]) => mockUseSecrets(...args),
  useIngresses: (...args: unknown[]) => mockUseIngresses(...args),
  useNodes: (...args: unknown[]) => mockUseNodes(...args),
  useJobs: (...args: unknown[]) => mockUseJobs(...args),
  useCronJobs: (...args: unknown[]) => mockUseCronJobs(...args),
  useStatefulSets: (...args: unknown[]) => mockUseStatefulSets(...args),
  useDaemonSets: (...args: unknown[]) => mockUseDaemonSets(...args),
  useHPAs: (...args: unknown[]) => mockUseHPAs(...args),
  useReplicaSets: (...args: unknown[]) => mockUseReplicaSets(...args),
  usePVs: (...args: unknown[]) => mockUsePVs(...args),
  useResourceQuotas: (...args: unknown[]) => mockUseResourceQuotas(...args),
  useLimitRanges: (...args: unknown[]) => mockUseLimitRanges(...args),
  useNetworkPolicies: (...args: unknown[]) => mockUseNetworkPolicies(...args),
  useNamespaces: (...args: unknown[]) => mockUseNamespaces(...args),
  useOperatorSubscriptions: (...args: unknown[]) => mockUseOperatorSubscriptions(...args),
  useServiceAccounts: (...args: unknown[]) => mockUseServiceAccounts(...args),
  useK8sRoles: (...args: unknown[]) => mockUseK8sRoles(...args),
  useK8sRoleBindings: (...args: unknown[]) => mockUseK8sRoleBindings(...args),
}))

vi.mock('../../../hooks/useMCS', () => ({
  useServiceExports: (...args: unknown[]) => mockUseServiceExports(...args),
  useServiceImports: (...args: unknown[]) => mockUseServiceImports(...args),
}))

/** Speed up demo data timer for tests */
const FAST_DELAY_MS = 10
vi.mock('../../constants/network', () => ({
  SHORT_DELAY_MS: 10,
}))

// Import triggers auto-registration
import '../registerHooks'
import { getDataHook } from '../card/hooks/useDataSource'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

type HookFn = (params?: Record<string, unknown>) => {
  data: unknown
  isLoading: boolean
  error: Error | null
  refetch: (() => void) | (() => Promise<void>)
}

function getHook(name: string): HookFn {
  const hook = getDataHook(name)
  if (!hook) throw new Error(`Hook "${name}" not registered`)
  return hook as HookFn
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
})

afterEach(() => {
  vi.useRealTimers()
})

// ============================================================================
// Real-data wrapper hooks not covered by registerHooks-hooks.test.ts
// ============================================================================

describe('useUnifiedOperators via renderHook', () => {
  it('maps operators to data and passes cluster param', () => {
    const ops = [{ name: 'cert-manager' }]
    mockUseOperators.mockReturnValue({ operators: ops, isLoading: false, error: null, refetch: vi.fn() })
    const hook = getHook('useOperators')
    const { result } = renderHook(() => hook({ cluster: 'prod' }))
    expect(result.current.data).toEqual(ops)
    expect(mockUseOperators).toHaveBeenCalledWith('prod')
  })

  it('wraps error string to Error object', () => {
    mockUseOperators.mockReturnValue({ operators: [], isLoading: false, error: 'fail', refetch: vi.fn() })
    const hook = getHook('useOperators')
    const { result } = renderHook(() => hook())
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('fail')
  })
})

describe('useUnifiedPVCs via renderHook', () => {
  it('maps pvcs to data and passes cluster+namespace', () => {
    const pvcs = [{ name: 'pvc-1' }]
    mockUsePVCs.mockReturnValue({ pvcs, isLoading: false, error: null, refetch: vi.fn() })
    const hook = getHook('usePVCs')
    const { result } = renderHook(() => hook({ cluster: 'dev', namespace: 'storage' }))
    expect(result.current.data).toEqual(pvcs)
    expect(mockUsePVCs).toHaveBeenCalledWith('dev', 'storage')
  })
})

describe('useUnifiedJobs via renderHook', () => {
  it('maps jobs to data', () => {
    const jobs = [{ name: 'backup-job' }]
    mockUseJobs.mockReturnValue({ jobs, isLoading: false, error: null, refetch: vi.fn() })
    const hook = getHook('useJobs')
    const { result } = renderHook(() => hook({ cluster: 'c1', namespace: 'batch' }))
    expect(result.current.data).toEqual(jobs)
    expect(mockUseJobs).toHaveBeenCalledWith('c1', 'batch')
  })
})

describe('useUnifiedCronJobs via renderHook', () => {
  it('maps cronjobs to data', () => {
    const cronjobs = [{ name: 'nightly-clean' }]
    mockUseCronJobs.mockReturnValue({ cronjobs, isLoading: false, error: null, refetch: vi.fn() })
    const hook = getHook('useCronJobs')
    const { result } = renderHook(() => hook({ cluster: 'c2', namespace: 'cron' }))
    expect(result.current.data).toEqual(cronjobs)
    expect(mockUseCronJobs).toHaveBeenCalledWith('c2', 'cron')
  })
})

describe('useUnifiedCachedDeployments via renderHook', () => {
  it('maps data and forwards params', () => {
    const deps = [{ name: 'api-server' }]
    mockUseCachedDeployments.mockReturnValue({ data: deps, isLoading: false, error: null, refetch: vi.fn() })
    const hook = getHook('useCachedDeployments')
    const { result } = renderHook(() => hook({ cluster: 'prod', namespace: 'apps' }))
    expect(result.current.data).toEqual(deps)
    expect(mockUseCachedDeployments).toHaveBeenCalledWith('prod', 'apps')
  })

  it('wraps error and calls refetch wrapper', () => {
    const innerRefetch = vi.fn()
    mockUseCachedDeployments.mockReturnValue({ data: [], isLoading: false, error: 'timeout', refetch: innerRefetch })
    const hook = getHook('useCachedDeployments')
    const { result } = renderHook(() => hook())
    expect(result.current.error).toBeInstanceOf(Error)
    result.current.refetch()
    expect(innerRefetch).toHaveBeenCalled()
  })
})

describe('useUnifiedServiceAccounts via renderHook', () => {
  it('maps serviceAccounts to data', () => {
    const sas = [{ name: 'default' }]
    mockUseServiceAccounts.mockReturnValue({ serviceAccounts: sas, isLoading: false, error: null, refetch: vi.fn() })
    const hook = getHook('useServiceAccounts')
    const { result } = renderHook(() => hook({ cluster: 'c1', namespace: 'kube-system' }))
    expect(result.current.data).toEqual(sas)
    expect(mockUseServiceAccounts).toHaveBeenCalledWith('c1', 'kube-system')
  })
})

// ============================================================================
// Demo data hooks — exercise useDemoDataHook lifecycle via renderHook
// ============================================================================

describe('useDemoDataHook lifecycle (demo mode OFF)', () => {
  beforeEach(() => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  })

  const demoHooks = [
    'useCachedClusterMetrics',
    'useCachedResourceUsage',
    'useCachedEventsTimeline',
    'useSecurityIssues',
    'useActiveAlerts',
    'useStorageOverview',
    'useNetworkOverview',
    'useTopPods',
    'useGitOpsDrift',
    'usePodHealthTrend',
    'useResourceTrend',
    'useComputeOverview',
  ]

  for (const hookName of demoHooks) {
    it(`${hookName} returns empty data when demo mode is off`, () => {
      const hook = getHook(hookName)
      const { result } = renderHook(() => hook())
      expect(result.current.data).toEqual([])
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
    })
  }
})

describe('useDemoDataHook lifecycle (demo mode ON)', () => {
  beforeEach(() => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
  })

  it('starts loading then resolves with demo data', async () => {
    const hook = getHook('useSecurityIssues')
    const { result } = renderHook(() => hook())

    // Initially loading, data is empty
    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toEqual([])

    // Advance past the SHORT_DELAY_MS timer
    await act(async () => {
      vi.advanceTimersByTime(FAST_DELAY_MS + 1)
    })

    // After timer, data should be populated
    expect(result.current.isLoading).toBe(false)
    expect(Array.isArray(result.current.data)).toBe(true)
    expect((result.current.data as unknown[]).length).toBeGreaterThan(0)
  })

  it('provides a no-op refetch function', () => {
    const hook = getHook('useStorageOverview')
    const { result } = renderHook(() => hook())
    expect(typeof result.current.refetch).toBe('function')
    expect(() => result.current.refetch()).not.toThrow()
  })
})

// ============================================================================
// Batch 4 demo hooks — ArgoCD, GPU, ML, Policy
// ============================================================================

describe('Batch 4 demo hooks (demo mode OFF)', () => {
  beforeEach(() => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  })

  const batch4Hooks = [
    'useArgoCDApplications',
    'useGPUInventory',
    'useProwJobs',
    'useMLJobs',
    'useMLNotebooks',
    'useOPAPolicies',
    'useKyvernoPolicies',
    'useAlertRules',
    'useChartVersions',
    'useCRDHealth',
    'useComplianceScore',
    'useGPUWorkloads',
    'useDeploymentProgress',
  ]

  for (const hookName of batch4Hooks) {
    it(`${hookName} returns empty data when not in demo mode`, () => {
      const hook = getHook(hookName)
      const { result } = renderHook(() => hook())
      expect(result.current.data).toEqual([])
      expect(result.current.error).toBeNull()
    })
  }
})

describe('Batch 4 demo hooks (demo mode ON)', () => {
  beforeEach(() => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
  })

  it('useArgoCDApplications returns demo data after timer', async () => {
    const hook = getHook('useArgoCDApplications')
    const { result } = renderHook(() => hook())
    await act(async () => { vi.advanceTimersByTime(FAST_DELAY_MS + 1) })
    expect((result.current.data as unknown[]).length).toBeGreaterThan(0)
  })

  it('useGPUInventory returns demo data after timer', async () => {
    const hook = getHook('useGPUInventory')
    const { result } = renderHook(() => hook())
    await act(async () => { vi.advanceTimersByTime(FAST_DELAY_MS + 1) })
    expect((result.current.data as unknown[]).length).toBeGreaterThan(0)
  })

  it('useMLJobs returns demo data after timer', async () => {
    const hook = getHook('useMLJobs')
    const { result } = renderHook(() => hook())
    await act(async () => { vi.advanceTimersByTime(FAST_DELAY_MS + 1) })
    expect((result.current.data as unknown[]).length).toBeGreaterThan(0)
  })

  it('useComplianceScore returns demo data after timer', async () => {
    const hook = getHook('useComplianceScore')
    const { result } = renderHook(() => hook())
    await act(async () => { vi.advanceTimersByTime(FAST_DELAY_MS + 1) })
    expect((result.current.data as unknown[]).length).toBeGreaterThan(0)
  })
})

// ============================================================================
// Batch 5 demo hooks — GitOps, Security, Status
// ============================================================================

describe('Batch 5 demo hooks (demo mode OFF)', () => {
  beforeEach(() => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  })

  const batch5Hooks = [
    'useArgoCDHealth',
    'useArgoCDSyncStatus',
    'useGatewayStatus',
    'useKustomizationStatus',
    'useProviderHealth',
    'useUpgradeStatus',
    'useProwStatus',
    'useProwHistory',
    'useHelmHistory',
    'useExternalSecrets',
    'useCertManager',
    'useVaultSecrets',
    'useFalcoAlerts',
    'useKubescapeScan',
    'useTrivyScan',
    'useEventSummary',
    'useAppStatus',
    'useGPUStatus',
    'useGPUUtilization',
    'useGPUUsageTrend',
    'usePolicyViolations',
    'useNamespaceOverview',
    'useNamespaceQuotas',
    'useNamespaceRBAC',
    'useResourceCapacity',
  ]

  for (const hookName of batch5Hooks) {
    it(`${hookName} returns empty data when not in demo mode`, () => {
      const hook = getHook(hookName)
      const { result } = renderHook(() => hook())
      expect(result.current.data).toEqual([])
      expect(result.current.error).toBeNull()
    })
  }
})

describe('Batch 5 demo hooks (demo mode ON)', () => {
  beforeEach(() => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
  })

  it('useArgoCDHealth returns demo data after timer', async () => {
    const hook = getHook('useArgoCDHealth')
    const { result } = renderHook(() => hook())
    await act(async () => { vi.advanceTimersByTime(FAST_DELAY_MS + 1) })
    expect((result.current.data as unknown[]).length).toBeGreaterThan(0)
  })

  it('useFalcoAlerts returns demo data after timer', async () => {
    const hook = getHook('useFalcoAlerts')
    const { result } = renderHook(() => hook())
    await act(async () => { vi.advanceTimersByTime(FAST_DELAY_MS + 1) })
    expect((result.current.data as unknown[]).length).toBeGreaterThan(0)
  })

  it('useGPUStatus returns demo data after timer', async () => {
    const hook = getHook('useGPUStatus')
    const { result } = renderHook(() => hook())
    await act(async () => { vi.advanceTimersByTime(FAST_DELAY_MS + 1) })
    expect((result.current.data as unknown[]).length).toBeGreaterThan(0)
  })

  it('useResourceCapacity returns demo data after timer', async () => {
    const hook = getHook('useResourceCapacity')
    const { result } = renderHook(() => hook())
    await act(async () => { vi.advanceTimersByTime(FAST_DELAY_MS + 1) })
    expect((result.current.data as unknown[]).length).toBeGreaterThan(0)
  })

  it('usePolicyViolations returns demo data after timer', async () => {
    const hook = getHook('usePolicyViolations')
    const { result } = renderHook(() => hook())
    await act(async () => { vi.advanceTimersByTime(FAST_DELAY_MS + 1) })
    expect((result.current.data as unknown[]).length).toBeGreaterThan(0)
  })
})

// ============================================================================
// Batch 6 demo hooks — GitHub, RSS, Cost
// ============================================================================

describe('Batch 6 demo hooks (demo mode OFF)', () => {
  beforeEach(() => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  })

  const batch6Hooks = [
    'useGithubActivity',
    'useRSSFeed',
    'useKubecostOverview',
    'useOpencostOverview',
    'useClusterCosts',
  ]

  for (const hookName of batch6Hooks) {
    it(`${hookName} returns empty data when not in demo mode`, () => {
      const hook = getHook(hookName)
      const { result } = renderHook(() => hook())
      expect(result.current.data).toEqual([])
      expect(result.current.error).toBeNull()
    })
  }
})

describe('Batch 6 demo hooks (demo mode ON)', () => {
  beforeEach(() => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
  })

  it('useGithubActivity returns demo data after timer', async () => {
    const hook = getHook('useGithubActivity')
    const { result } = renderHook(() => hook())
    await act(async () => { vi.advanceTimersByTime(FAST_DELAY_MS + 1) })
    expect((result.current.data as unknown[]).length).toBeGreaterThan(0)
  })

  it('useRSSFeed returns demo data after timer', async () => {
    const hook = getHook('useRSSFeed')
    const { result } = renderHook(() => hook())
    await act(async () => { vi.advanceTimersByTime(FAST_DELAY_MS + 1) })
    expect((result.current.data as unknown[]).length).toBeGreaterThan(0)
  })

  it('useClusterCosts returns demo data after timer', async () => {
    const hook = getHook('useClusterCosts')
    const { result } = renderHook(() => hook())
    await act(async () => { vi.advanceTimersByTime(FAST_DELAY_MS + 1) })
    expect((result.current.data as unknown[]).length).toBeGreaterThan(0)
  })
})

// ============================================================================
// useDemoDataHook timer cleanup — ensures clearTimeout on unmount
// ============================================================================

describe('useDemoDataHook timer cleanup', () => {
  it('cleans up timer on unmount during loading', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    const hook = getHook('useActiveAlerts')
    const { result, unmount } = renderHook(() => hook())
    expect(result.current.isLoading).toBe(true)

    // Unmount before timer fires — should not throw or leak
    unmount()

    // Advance timers after unmount — no error expected
    vi.advanceTimersByTime(FAST_DELAY_MS + 1)
  })

  it('transitions from demo-on to demo-off', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    const hook = getHook('useTopPods')
    const { result, rerender } = renderHook(() => hook())

    // Let demo data load
    await act(async () => { vi.advanceTimersByTime(FAST_DELAY_MS + 1) })
    expect((result.current.data as unknown[]).length).toBeGreaterThan(0)

    // Switch to non-demo mode
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
    rerender()

    expect(result.current.data).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })
})
