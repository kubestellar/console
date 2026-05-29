import { describe, it, expect, vi } from 'vitest'
import { cronJobStatusConfig } from '../../../config/cards/cronjob-status'
import { daemonSetStatusConfig } from '../../../config/cards/daemonset-status'
import { hpaStatusConfig } from '../../../config/cards/hpa-status'
import { replicaSetStatusConfig } from '../../../config/cards/replicaset-status'
import { statefulSetStatusConfig } from '../../../config/cards/statefulset-status'

vi.mock('../card/hooks/useDataSource', () => {
  const g = globalThis as Record<string, unknown>
  if (!g.__registeredHookNames) g.__registeredHookNames = []
  return {
    registerDataHook: vi.fn((name: string) => {
      ;(g.__registeredHookNames as string[]).push(name)
    }),
  }
})

function getRegisteredNames(): string[] {
  return ((globalThis as Record<string, unknown>).__registeredHookNames || []) as string[]
}

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
  useCachedHPAs: vi.fn().mockReturnValue({ hpas: [], isLoading: false, error: null, isDemoFallback: false, refetch: vi.fn() }),
  useCachedReplicaSets: vi.fn().mockReturnValue({ replicasets: [], isLoading: false, error: null, isDemoFallback: false, refetch: vi.fn() }),
  useCachedStatefulSets: vi.fn().mockReturnValue({ statefulsets: [], isLoading: false, error: null, isDemoFallback: false, refetch: vi.fn() }),
  useCachedDaemonSets: vi.fn().mockReturnValue({ daemonsets: [], isLoading: false, error: null, isDemoFallback: false, refetch: vi.fn() }),
  useCachedCronJobs: vi.fn().mockReturnValue({ cronjobs: [], isLoading: false, error: null, isDemoFallback: false, refetch: vi.fn() }),
}))

vi.mock('../../../hooks/mcp', () => ({
  useClusters: vi.fn().mockReturnValue({ clusters: [], deduplicatedClusters: [], isLoading: false, error: null, refetch: vi.fn() }),
  usePVCs: vi.fn().mockReturnValue({ pvcs: [], isLoading: false, error: null, refetch: vi.fn() }),
  useServices: vi.fn().mockReturnValue({ services: [], isLoading: false, error: null, refetch: vi.fn() }),
  useOperators: vi.fn().mockReturnValue({ operators: [], isLoading: false, error: null, refetch: vi.fn() }),
  useHelmReleases: vi.fn().mockReturnValue({ releases: [], isLoading: false, error: null, refetch: vi.fn() }),
  useConfigMaps: vi.fn().mockReturnValue({ configmaps: [], isLoading: false, error: null, refetch: vi.fn() }),
  useSecrets: vi.fn().mockReturnValue({ secrets: [], isLoading: false, error: null, refetch: vi.fn() }),
  useIngresses: vi.fn().mockReturnValue({ ingresses: [], isLoading: false, error: null, refetch: vi.fn() }),
  useNodes: vi.fn().mockReturnValue({ nodes: [], isLoading: false, error: null, refetch: vi.fn() }),
  useJobs: vi.fn().mockReturnValue({ jobs: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCronJobs: vi.fn().mockReturnValue({ cronJobs: [], isLoading: false, error: null, refetch: vi.fn() }),
  useStatefulSets: vi.fn().mockReturnValue({ statefulSets: [], isLoading: false, error: null, refetch: vi.fn() }),
  useDaemonSets: vi.fn().mockReturnValue({ daemonSets: [], isLoading: false, error: null, refetch: vi.fn() }),
  useHPAs: vi.fn().mockReturnValue({ hpas: [], isLoading: false, error: null, refetch: vi.fn() }),
  useReplicaSets: vi.fn().mockReturnValue({ replicaSets: [], isLoading: false, error: null, refetch: vi.fn() }),
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

vi.mock('../../constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    SHORT_DELAY_MS: 0,
  }
})

import '../registerHooks'

describe('registerHooks cached hook coverage', () => {
  it('registers the new cached workload hooks', () => {
    expect(getRegisteredNames()).toEqual(expect.arrayContaining([
      'useCachedHPAs',
      'useCachedReplicaSets',
      'useCachedStatefulSets',
      'useCachedDaemonSets',
      'useCachedCronJobs',
    ]))
  })

  it('points the updated card configs at cached hooks', () => {
    expect(hpaStatusConfig.dataSource).toMatchObject({ hook: 'useCachedHPAs' })
    expect(replicaSetStatusConfig.dataSource).toMatchObject({ hook: 'useCachedReplicaSets' })
    expect(statefulSetStatusConfig.dataSource).toMatchObject({ hook: 'useCachedStatefulSets' })
    expect(daemonSetStatusConfig.dataSource).toMatchObject({ hook: 'useCachedDaemonSets' })
    expect(cronJobStatusConfig.dataSource).toMatchObject({ hook: 'useCachedCronJobs' })
  })
})
