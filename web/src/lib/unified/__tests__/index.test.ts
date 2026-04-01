/**
 * Tests for unified/index.ts barrel exports
 *
 * Verifies all public API exports are accessible. This prevents
 * accidental export removal during refactoring.
 */
import { describe, it, expect, vi } from 'vitest'

// Mock heavy dependencies to keep the test fast and prevent transitive import errors.
// The paths are relative to the importing module, so we need multiple patterns.

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
  getDemoMode: () => false,
  isDemoModeForced: false,
}))

vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
  getDemoMode: () => false,
  isDemoModeForced: false,
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => false,
  getDemoMode: () => false,
  isNetlifyDeployment: false,
  isDemoModeForced: false,
  canToggleDemoMode: () => true,
  setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(),
  subscribeDemoMode: () => () => {},
  isDemoToken: () => false,
  hasRealToken: () => true,
  setDemoToken: vi.fn(),
  useDemoMode: () => false,
}))

vi.mock('../../demoMode', () => ({
  isDemoMode: () => false,
  getDemoMode: () => false,
  isNetlifyDeployment: false,
  isDemoModeForced: false,
  canToggleDemoMode: () => true,
  setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(),
  subscribeDemoMode: () => () => {},
  isDemoToken: () => false,
  hasRealToken: () => true,
  setDemoToken: vi.fn(),
  useDemoMode: () => false,
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({
    usage: { used: 0, limit: 1000 },
    alertLevel: 'normal',
    percentage: 0,
    remaining: 1000,
    addTokens: () => {},
    updateSettings: () => {},
    resetUsage: () => {},
    isAIDisabled: () => false,
    isDemoData: true,
  }),
  addCategoryTokens: () => {},
  setActiveTokenCategory: () => {},
}))

vi.mock('../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({
    usage: { used: 0, limit: 1000 },
    alertLevel: 'normal',
    percentage: 0,
    remaining: 1000,
    addTokens: () => {},
    updateSettings: () => {},
    resetUsage: () => {},
    isAIDisabled: () => false,
    isDemoData: true,
  }),
  addCategoryTokens: () => {},
  setActiveTokenCategory: () => {},
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

// Mock the hooks that registerHooks imports (prevents full app tree import)
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedPodIssues: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCachedEvents: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCachedDeployments: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCachedDeploymentIssues: vi.fn().mockReturnValue({ issues: [], isLoading: false, error: null, refetch: vi.fn() }),
}))

vi.mock('../../hooks/useCachedData', () => ({
  useCachedPodIssues: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCachedEvents: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCachedDeployments: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCachedDeploymentIssues: vi.fn().mockReturnValue({ issues: [], isLoading: false, error: null, refetch: vi.fn() }),
}))

const stubHook = () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() })
const namedResult = (name: string) => ({ [name]: [], isLoading: false, error: null, refetch: vi.fn() })

vi.mock('../../../hooks/mcp', () => ({
  useClusters: vi.fn().mockReturnValue({ clusters: [], isLoading: false, error: null, refetch: vi.fn() }),
  usePVCs: vi.fn().mockReturnValue({ pvcs: [], isLoading: false, error: null, refetch: vi.fn() }),
  useServices: vi.fn().mockReturnValue({ services: [], isLoading: false, error: null, refetch: vi.fn() }),
  useOperators: vi.fn().mockReturnValue({ operators: [], isLoading: false, error: null, refetch: vi.fn() }),
  useHelmReleases: vi.fn().mockReturnValue({ releases: [], isLoading: false, error: null, refetch: vi.fn() }),
  useConfigMaps: vi.fn().mockReturnValue({ configmaps: [], isLoading: false, error: null, refetch: vi.fn() }),
  useSecrets: vi.fn().mockReturnValue({ secrets: [], isLoading: false, error: null, refetch: vi.fn() }),
  useIngresses: vi.fn().mockReturnValue({ ingresses: [], isLoading: false, error: null, refetch: vi.fn() }),
  useNodes: vi.fn().mockReturnValue({ nodes: [], isLoading: false, error: null, refetch: vi.fn() }),
  useJobs: vi.fn().mockReturnValue({ jobs: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCronJobs: vi.fn().mockReturnValue({ cronjobs: [], isLoading: false, error: null, refetch: vi.fn() }),
  useStatefulSets: vi.fn().mockReturnValue({ statefulsets: [], isLoading: false, error: null, refetch: vi.fn() }),
  useDaemonSets: vi.fn().mockReturnValue({ daemonsets: [], isLoading: false, error: null, refetch: vi.fn() }),
  useHPAs: vi.fn().mockReturnValue({ hpas: [], isLoading: false, error: null, refetch: vi.fn() }),
  useReplicaSets: vi.fn().mockReturnValue({ replicasets: [], isLoading: false, error: null, refetch: vi.fn() }),
  usePVs: vi.fn().mockReturnValue({ pvs: [], isLoading: false, error: null, refetch: vi.fn() }),
  useResourceQuotas: vi.fn().mockReturnValue({ resourceQuotas: [], isLoading: false, error: null, refetch: vi.fn() }),
  useLimitRanges: vi.fn().mockReturnValue({ limitRanges: [], isLoading: false, error: null, refetch: vi.fn() }),
  useNetworkPolicies: vi.fn().mockReturnValue({ networkpolicies: [], isLoading: false, error: null, refetch: vi.fn() }),
  useNamespaces: vi.fn().mockReturnValue({ namespaces: [], isLoading: false, error: null, refetch: vi.fn() }),
  useOperatorSubscriptions: vi.fn().mockReturnValue({ subscriptions: [], isLoading: false, error: null, refetch: vi.fn() }),
  useServiceAccounts: vi.fn().mockReturnValue({ serviceAccounts: [], isLoading: false, error: null, refetch: vi.fn() }),
  useK8sRoles: vi.fn().mockReturnValue({ roles: [], isLoading: false, error: null, refetch: vi.fn() }),
  useK8sRoleBindings: vi.fn().mockReturnValue({ bindings: [], isLoading: false, error: null, refetch: vi.fn() }),
}))

vi.mock('../../hooks/mcp', () => ({
  useClusters: vi.fn().mockReturnValue({ clusters: [], isLoading: false, error: null, refetch: vi.fn() }),
  usePVCs: vi.fn().mockReturnValue({ pvcs: [], isLoading: false, error: null, refetch: vi.fn() }),
  useServices: vi.fn().mockReturnValue({ services: [], isLoading: false, error: null, refetch: vi.fn() }),
  useOperators: vi.fn().mockReturnValue({ operators: [], isLoading: false, error: null, refetch: vi.fn() }),
  useHelmReleases: vi.fn().mockReturnValue({ releases: [], isLoading: false, error: null, refetch: vi.fn() }),
  useConfigMaps: vi.fn().mockReturnValue({ configmaps: [], isLoading: false, error: null, refetch: vi.fn() }),
  useSecrets: vi.fn().mockReturnValue({ secrets: [], isLoading: false, error: null, refetch: vi.fn() }),
  useIngresses: vi.fn().mockReturnValue({ ingresses: [], isLoading: false, error: null, refetch: vi.fn() }),
  useNodes: vi.fn().mockReturnValue({ nodes: [], isLoading: false, error: null, refetch: vi.fn() }),
  useJobs: vi.fn().mockReturnValue({ jobs: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCronJobs: vi.fn().mockReturnValue({ cronjobs: [], isLoading: false, error: null, refetch: vi.fn() }),
  useStatefulSets: vi.fn().mockReturnValue({ statefulsets: [], isLoading: false, error: null, refetch: vi.fn() }),
  useDaemonSets: vi.fn().mockReturnValue({ daemonsets: [], isLoading: false, error: null, refetch: vi.fn() }),
  useHPAs: vi.fn().mockReturnValue({ hpas: [], isLoading: false, error: null, refetch: vi.fn() }),
  useReplicaSets: vi.fn().mockReturnValue({ replicasets: [], isLoading: false, error: null, refetch: vi.fn() }),
  usePVs: vi.fn().mockReturnValue({ pvs: [], isLoading: false, error: null, refetch: vi.fn() }),
  useResourceQuotas: vi.fn().mockReturnValue({ resourceQuotas: [], isLoading: false, error: null, refetch: vi.fn() }),
  useLimitRanges: vi.fn().mockReturnValue({ limitRanges: [], isLoading: false, error: null, refetch: vi.fn() }),
  useNetworkPolicies: vi.fn().mockReturnValue({ networkpolicies: [], isLoading: false, error: null, refetch: vi.fn() }),
  useNamespaces: vi.fn().mockReturnValue({ namespaces: [], isLoading: false, error: null, refetch: vi.fn() }),
  useOperatorSubscriptions: vi.fn().mockReturnValue({ subscriptions: [], isLoading: false, error: null, refetch: vi.fn() }),
  useServiceAccounts: vi.fn().mockReturnValue({ serviceAccounts: [], isLoading: false, error: null, refetch: vi.fn() }),
  useK8sRoles: vi.fn().mockReturnValue({ roles: [], isLoading: false, error: null, refetch: vi.fn() }),
  useK8sRoleBindings: vi.fn().mockReturnValue({ bindings: [], isLoading: false, error: null, refetch: vi.fn() }),
}))

vi.mock('../../../hooks/useMCS', () => ({
  useServiceExports: vi.fn().mockReturnValue({ exports: [], isLoading: false, error: null, refetch: vi.fn() }),
  useServiceImports: vi.fn().mockReturnValue({ imports: [], isLoading: false, error: null, refetch: vi.fn() }),
}))

vi.mock('../../hooks/useMCS', () => ({
  useServiceExports: vi.fn().mockReturnValue({ exports: [], isLoading: false, error: null, refetch: vi.fn() }),
  useServiceImports: vi.fn().mockReturnValue({ imports: [], isLoading: false, error: null, refetch: vi.fn() }),
}))

vi.mock('../../constants/network', () => ({
  SHORT_DELAY_MS: 0,
  FETCH_DEFAULT_TIMEOUT_MS: 30000,
}))

vi.mock('../../../lib/constants/network', () => ({
  SHORT_DELAY_MS: 0,
  FETCH_DEFAULT_TIMEOUT_MS: 30000,
}))

/** Timeout for tests that import the full unified barrel */
const BARREL_IMPORT_TIMEOUT_MS = 30_000

describe('unified/index exports', () => {
  it('exports card components and hooks', { timeout: BARREL_IMPORT_TIMEOUT_MS }, async () => {
    const mod = await import('../index')

    // Card system
    expect(mod.registerDataHook).toBeTypeOf('function')
    expect(mod.getDataHook).toBeTypeOf('function')
    expect(mod.getRegisteredDataHooks).toBeTypeOf('function')
    expect(mod.registerRenderer).toBeTypeOf('function')
    expect(mod.getRenderer).toBeTypeOf('function')
    expect(mod.getRegisteredRenderers).toBeTypeOf('function')
    expect(mod.renderCell).toBeTypeOf('function')
  })

  it('exports stats utilities', { timeout: BARREL_IMPORT_TIMEOUT_MS }, async () => {
    const mod = await import('../index')

    expect(mod.resolveStatValue).toBeTypeOf('function')
    expect(mod.resolveFieldPath).toBeTypeOf('function')
    expect(mod.resolveComputedExpression).toBeTypeOf('function')
    expect(mod.resolveAggregate).toBeTypeOf('function')
    expect(mod.formatValue).toBeTypeOf('function')
    expect(mod.formatNumber).toBeTypeOf('function')
    expect(mod.formatBytes).toBeTypeOf('function')
    expect(mod.formatCurrency).toBeTypeOf('function')
    expect(mod.formatDuration).toBeTypeOf('function')
  })

  it('exports demo system utilities', { timeout: BARREL_IMPORT_TIMEOUT_MS }, async () => {
    const mod = await import('../index')

    expect(mod.registerDemoData).toBeTypeOf('function')
    expect(mod.registerDemoDataBatch).toBeTypeOf('function')
    expect(mod.hasDemoData).toBeTypeOf('function')
    expect(mod.generateDemoDataSync).toBeTypeOf('function')
    expect(mod.clearDemoDataCache).toBeTypeOf('function')
    expect(mod.getRegistryStats).toBeTypeOf('function')
  })

  it('exports hook registration', { timeout: BARREL_IMPORT_TIMEOUT_MS }, async () => {
    const mod = await import('../index')
    expect(mod.registerUnifiedHooks).toBeTypeOf('function')
  })
})
