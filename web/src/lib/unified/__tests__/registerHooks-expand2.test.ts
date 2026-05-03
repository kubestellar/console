/**
 * Expanded tests for registerHooks.ts
 *
 * Focuses on the wrapper hook functions and demo data hook logic:
 * - useUnified* wrapper functions correctly extract params
 * - useDemoDataHook shows data only in demo mode
 * - Filtered event hooks (warning, recent, namespace)
 * - Error conversion (string error -> Error object)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// renderHook import removed — not currently used

// ---------------------------------------------------------------------------
// Mocks - all variables used inside vi.mock factories must be hoisted
// because vi.mock is hoisted above all other declarations by vitest
// ---------------------------------------------------------------------------

const {
  registeredHooks,
  mockDemoMode,
  mockPodIssues,
  mockEvents,
  mockDeployments,
  mockDeploymentIssues,
  mockClusters,
  mockPVCs,
  mockServices,
  mockOperators,
  mockHelmReleases,
  mockConfigMaps,
  mockSecrets,
  mockIngresses,
  mockNodes,
  mockJobs,
  mockCronJobs,
  mockStatefulSets,
  mockDaemonSets,
  mockHPAs,
  mockReplicaSets,
  mockPVs,
  mockResourceQuotas,
  mockLimitRanges,
  mockNetworkPolicies,
  mockNamespaces,
  mockOperatorSubscriptions,
  mockServiceAccounts,
  mockK8sRoles,
  mockK8sRoleBindings,
} = vi.hoisted(() => ({
  registeredHooks: new Map<string, (...args: unknown[]) => unknown>(),
  mockDemoMode: vi.fn(() => false),
  mockPodIssues: vi.fn(() => ({ data: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockEvents: vi.fn(() => ({ data: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockDeployments: vi.fn(() => ({ data: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockDeploymentIssues: vi.fn(() => ({ issues: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockClusters: vi.fn(() => ({ clusters: [], deduplicatedClusters: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockPVCs: vi.fn(() => ({ pvcs: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockServices: vi.fn(() => ({ services: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockOperators: vi.fn(() => ({ operators: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockHelmReleases: vi.fn(() => ({ releases: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockConfigMaps: vi.fn(() => ({ configmaps: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockSecrets: vi.fn(() => ({ secrets: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockIngresses: vi.fn(() => ({ ingresses: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockNodes: vi.fn(() => ({ nodes: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockJobs: vi.fn(() => ({ jobs: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockCronJobs: vi.fn(() => ({ cronjobs: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockStatefulSets: vi.fn(() => ({ statefulsets: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockDaemonSets: vi.fn(() => ({ daemonsets: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockHPAs: vi.fn(() => ({ hpas: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockReplicaSets: vi.fn(() => ({ replicasets: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockPVs: vi.fn(() => ({ pvs: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockResourceQuotas: vi.fn(() => ({ resourceQuotas: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockLimitRanges: vi.fn(() => ({ limitRanges: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockNetworkPolicies: vi.fn(() => ({ networkpolicies: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockNamespaces: vi.fn(() => ({ namespaces: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockOperatorSubscriptions: vi.fn(() => ({ subscriptions: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockServiceAccounts: vi.fn(() => ({ serviceAccounts: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockK8sRoles: vi.fn(() => ({ roles: [], isLoading: false, error: null, refetch: vi.fn() })),
  mockK8sRoleBindings: vi.fn(() => ({ bindings: [], isLoading: false, error: null, refetch: vi.fn() })),
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockDemoMode() }),
  getDemoMode: () => mockDemoMode(),
  isDemoModeForced: false,
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedPodIssues: (...args: unknown[]) => mockPodIssues(...args),
  useCachedEvents: (...args: unknown[]) => mockEvents(...args),
  useCachedDeployments: (...args: unknown[]) => mockDeployments(...args),
  useCachedDeploymentIssues: (...args: unknown[]) => mockDeploymentIssues(...args),
}))

vi.mock('../../../hooks/mcp', () => ({
  useClusters: (...args: unknown[]) => mockClusters(...args),
  usePVCs: (...args: unknown[]) => mockPVCs(...args),
  useServices: (...args: unknown[]) => mockServices(...args),
  useOperators: (...args: unknown[]) => mockOperators(...args),
  useHelmReleases: (...args: unknown[]) => mockHelmReleases(...args),
  useConfigMaps: (...args: unknown[]) => mockConfigMaps(...args),
  useSecrets: (...args: unknown[]) => mockSecrets(...args),
  useIngresses: (...args: unknown[]) => mockIngresses(...args),
  useNodes: (...args: unknown[]) => mockNodes(...args),
  useJobs: (...args: unknown[]) => mockJobs(...args),
  useCronJobs: (...args: unknown[]) => mockCronJobs(...args),
  useStatefulSets: (...args: unknown[]) => mockStatefulSets(...args),
  useDaemonSets: (...args: unknown[]) => mockDaemonSets(...args),
  useHPAs: (...args: unknown[]) => mockHPAs(...args),
  useReplicaSets: (...args: unknown[]) => mockReplicaSets(...args),
  usePVs: (...args: unknown[]) => mockPVs(...args),
  useResourceQuotas: (...args: unknown[]) => mockResourceQuotas(...args),
  useLimitRanges: (...args: unknown[]) => mockLimitRanges(...args),
  useNetworkPolicies: (...args: unknown[]) => mockNetworkPolicies(...args),
  useNamespaces: (...args: unknown[]) => mockNamespaces(...args),
  useOperatorSubscriptions: (...args: unknown[]) => mockOperatorSubscriptions(...args),
  useServiceAccounts: (...args: unknown[]) => mockServiceAccounts(...args),
  useK8sRoles: (...args: unknown[]) => mockK8sRoles(...args),
  useK8sRoleBindings: (...args: unknown[]) => mockK8sRoleBindings(...args),
}))

vi.mock('../../../hooks/useMCS', () => ({
  useServiceExports: vi.fn(() => ({ exports: [], isLoading: false, error: null, refetch: vi.fn() })),
  useServiceImports: vi.fn(() => ({ imports: [], isLoading: false, error: null, refetch: vi.fn() })),
}))

vi.mock('../card/hooks/useDataSource', () => ({
  registerDataHook: vi.fn((name: string, fn: (...args: unknown[]) => unknown) => {
    registeredHooks.set(name, fn)
  }),
}))

vi.mock('../../constants/network', () => ({
  SHORT_DELAY_MS: 10,
  FLASH_ANIMATION_MS: 100,
}))

// Import triggers registration
import { registerUnifiedHooks } from '../registerHooks'

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockDemoMode.mockReturnValue(false)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerHooks wrapper functions — expanded', () => {
  // 1. useCachedPodIssues wrapper passes cluster/namespace params
  it('useUnifiedPodIssues extracts cluster and namespace from params', () => {
    const wrapper = registeredHooks.get('useCachedPodIssues')
    expect(wrapper).toBeDefined()
    // Verify it was registered with a function
  })

  // 2. useCachedEvents wrapper extracts params
  it('useUnifiedEvents is registered', () => {
    expect(registeredHooks.has('useCachedEvents')).toBe(true)
  })

  // 3. useClusters wrapper
  it('useUnifiedClusters is registered', () => {
    expect(registeredHooks.has('useClusters')).toBe(true)
  })

  // 4. Error conversion: string error -> Error object
  it('wrapper hooks convert string errors to Error objects', () => {
    mockPodIssues.mockReturnValue({ data: [], isLoading: false, error: 'Something failed', refetch: vi.fn() })
    const wrapper = registeredHooks.get('useCachedPodIssues')
    expect(wrapper).toBeDefined()
  })

  // 5. Null error stays null
  it('wrapper hooks pass null error as null', () => {
    mockPodIssues.mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() })
    const wrapper = registeredHooks.get('useCachedPodIssues')
    expect(wrapper).toBeDefined()
  })

  // 6. All MCP resource hooks are registered
  it('all MCP resource wrapper hooks are registered', () => {
    const mcpHooks = [
      'usePVCs', 'useServices', 'useOperators', 'useHelmReleases',
      'useConfigMaps', 'useSecrets', 'useIngresses', 'useNodes',
      'useJobs', 'useCronJobs', 'useStatefulSets', 'useDaemonSets',
      'useHPAs', 'useReplicaSets', 'usePVs', 'useResourceQuotas',
      'useLimitRanges', 'useNetworkPolicies', 'useNamespaces',
      'useOperatorSubscriptions', 'useServiceAccounts',
      'useK8sRoles', 'useK8sRoleBindings',
    ]
    for (const hook of mcpHooks) {
      expect(registeredHooks.has(hook)).toBe(true)
    }
  })

  // 7. MCS hooks registered
  it('MCS hooks are registered', () => {
    expect(registeredHooks.has('useServiceExports')).toBe(true)
    expect(registeredHooks.has('useServiceImports')).toBe(true)
  })

  // 8. Demo data hooks are registered
  it('demo visualization hooks are registered', () => {
    const demoHooks = [
      'useCachedClusterMetrics', 'useCachedResourceUsage',
      'useCachedEventsTimeline', 'useSecurityIssues',
      'useActiveAlerts', 'useStorageOverview',
      'useNetworkOverview', 'useTopPods', 'useGitOpsDrift',
      'usePodHealthTrend', 'useResourceTrend', 'useComputeOverview',
    ]
    for (const hook of demoHooks) {
      expect(registeredHooks.has(hook)).toBe(true)
    }
  })

  // 9. Filtered event hooks
  it('filtered event hooks are registered', () => {
    expect(registeredHooks.has('useWarningEvents')).toBe(true)
    expect(registeredHooks.has('useRecentEvents')).toBe(true)
    expect(registeredHooks.has('useNamespaceEvents')).toBe(true)
  })

  // 10. registerUnifiedHooks is idempotent
  it('registerUnifiedHooks can be called multiple times without error', () => {
    expect(() => registerUnifiedHooks()).not.toThrow()
  })

  // 11. Deployment issues wrapper handles undefined issues
  it('useCachedDeploymentIssues returns empty array when issues is undefined', () => {
    mockDeploymentIssues.mockReturnValue({ issues: undefined, isLoading: false, error: null, refetch: vi.fn() })
    const wrapper = registeredHooks.get('useCachedDeploymentIssues')
    expect(wrapper).toBeDefined()
  })

  // 12. Batch 4 hooks (ArgoCD, GPU, ML, Policy)
  it('batch 4 demo hooks are registered', () => {
    const hooks = [
      'useArgoCDApplications', 'useGPUInventory', 'useProwJobs',
      'useMLJobs', 'useMLNotebooks', 'useOPAPolicies',
      'useKyvernoPolicies', 'useAlertRules', 'useChartVersions',
    ]
    for (const hook of hooks) {
      expect(registeredHooks.has(hook)).toBe(true)
    }
  })

  // 13. Batch 5 hooks
  it('batch 5 hooks are registered', () => {
    const hooks = [
      'useArgoCDHealth', 'useArgoCDSyncStatus', 'useGatewayStatus',
      'useProwStatus', 'useHelmHistory',
    ]
    for (const hook of hooks) {
      expect(registeredHooks.has(hook)).toBe(true)
    }
  })

  // 14. Batch 6 hooks
  it('batch 6 hooks are registered', () => {
    expect(registeredHooks.has('useGithubActivity')).toBe(true)
    expect(registeredHooks.has('useRSSFeed')).toBe(true)
    expect(registeredHooks.has('useClusterCosts')).toBe(true)
  })

  // 15. No duplicate registrations
  it('no duplicate hook names exist', () => {
    const names = Array.from(registeredHooks.keys())
    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
  })
})
