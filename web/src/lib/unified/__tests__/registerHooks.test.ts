/**
 * Deep branch-coverage tests for registerHooks.ts
 *
 * Tests hook registration and verifies all data sources are registered.
 * Since registerHooks auto-registers on import (module-level side-effect),
 * we intercept registrations by mocking registerDataHook before import.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'

// ── Capture registrations ────────────────────────────────────────────
// vi.mock factories are hoisted before all other code, so we must
// initialize the capture array inside the factory itself.
vi.mock('../card/hooks/useDataSource', () => {
  const g = globalThis as Record<string, unknown>
  if (!g.__registeredHookNames) g.__registeredHookNames = []
  return {
    registerDataHook: vi.fn((name: string) => {
      (g.__registeredHookNames as string[]).push(name)
    }),
  }
})

// Convenience reference (safe — the mock factory has already run by import time)
function getRegisteredNames(): string[] {
  return ((globalThis as Record<string, unknown>).__registeredHookNames || []) as string[]
}

// ── Mock all upstream hooks (prevent real imports) ───────────────────
vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: true }),
  getDemoMode: () => true,
  isDemoModeForced: false,
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedPodIssues: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCachedEvents: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCachedDeployments: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCachedDeploymentIssues: vi.fn().mockReturnValue({ issues: [], isLoading: false, error: null, refetch: vi.fn() }),
}))

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

vi.mock('../../../hooks/useMCS', () => ({
  useServiceExports: vi.fn().mockReturnValue({ exports: [], isLoading: false, error: null, refetch: vi.fn() }),
  useServiceImports: vi.fn().mockReturnValue({ imports: [], isLoading: false, error: null, refetch: vi.fn() }),
}))

vi.mock('../../constants/network', () => ({
  SHORT_DELAY_MS: 0,
}))

// ── Import triggers auto-registration ────────────────────────────────
// The module-level `registerUnifiedHooks()` call runs when imported.
import '../registerHooks'

describe('registerUnifiedHooks', () => {
  it('registers more than 50 hooks', () => {
    expect(getRegisteredNames().length).toBeGreaterThan(50)
  })

  it('registers core real-data hooks', () => {
    const coreHooks = [
      'useCachedPodIssues',
      'useCachedEvents',
      'useCachedDeployments',
      'useClusters',
      'usePVCs',
      'useServices',
      'useCachedDeploymentIssues',
      'useOperators',
      'useHelmReleases',
      'useConfigMaps',
      'useSecrets',
      'useIngresses',
      'useNodes',
      'useJobs',
      'useCronJobs',
      'useStatefulSets',
      'useDaemonSets',
      'useHPAs',
      'useReplicaSets',
      'usePVs',
      'useResourceQuotas',
      'useLimitRanges',
      'useNetworkPolicies',
      'useNamespaces',
      'useOperatorSubscriptions',
      'useServiceAccounts',
      'useK8sRoles',
      'useK8sRoleBindings',
      'useServiceExports',
      'useServiceImports',
    ]
    for (const hook of coreHooks) {
      expect(getRegisteredNames()).toContain(hook)
    }
  })

  it('registers filtered event hooks', () => {
    expect(getRegisteredNames()).toContain('useWarningEvents')
    expect(getRegisteredNames()).toContain('useRecentEvents')
    expect(getRegisteredNames()).toContain('useNamespaceEvents')
  })

  it('registers demo data hooks for visualizations', () => {
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
    for (const hook of demoHooks) {
      expect(getRegisteredNames()).toContain(hook)
    }
  })

  it('registers batch 4 hooks (ArgoCD, GPU, ML, Policy)', () => {
    const batch4 = [
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
    for (const hook of batch4) {
      expect(getRegisteredNames()).toContain(hook)
    }
  })

  it('registers batch 5 hooks (GitOps, Security, Status)', () => {
    const batch5 = [
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
    for (const hook of batch5) {
      expect(getRegisteredNames()).toContain(hook)
    }
  })

  it('registers batch 6 hooks (remaining compatible)', () => {
    const batch6 = [
      'useGithubActivity',
      'useRSSFeed',
      'useKubecostOverview',
      'useOpencostOverview',
      'useClusterCosts',
    ]
    for (const hook of batch6) {
      expect(getRegisteredNames()).toContain(hook)
    }
  })

  it('has no duplicate registrations', () => {
    const names = getRegisteredNames()
    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
  })

  it('exports registerUnifiedHooks as a named function', async () => {
    const mod = await import('../registerHooks')
    expect(mod.registerUnifiedHooks).toBeTypeOf('function')
  })
})
