import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../../hooks/useMCP', () => ({
  useClusters: () => ({ deduplicatedClusters: [], isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0 }),
}))

vi.mock('../../../../hooks/useCachedData', () => ({
  useCachedPodIssues: () => ({ issues: [] }),
  useCachedNodes: () => ({ nodes: [], isLoading: false, isDemoFallback: null }),
  useCachedNamespaces: () => ({ namespaces: [], isLoading: false, isDemoFallback: null }),
  useCachedDeployments: () => ({ deployments: [], isDemoFallback: null }),
  useCachedServices: () => ({ services: [], isDemoFallback: null }),
  useCachedPVCs: () => ({ pvcs: [], isDemoFallback: null }),
  useCachedPods: () => ({ pods: [], isDemoFallback: null }),
  useCachedConfigMaps: () => ({ configmaps: [], isDemoFallback: null }),
  useCachedSecrets: () => ({ secrets: [], isDemoFallback: null }),
  useCachedServiceAccounts: () => ({ serviceAccounts: [], isDemoFallback: null }),
  useCachedJobs: () => ({ jobs: [], isDemoFallback: null }),
  useCachedHPAs: () => ({ hpas: null, isDemoFallback: null }),
  useCachedReplicaSets: () => ({ replicasets: [], isDemoFallback: null }),
  useCachedStatefulSets: () => ({ statefulsets: [], isDemoFallback: null }),
  useCachedDaemonSets: () => ({ daemonsets: [], isDemoFallback: null }),
  useCachedCronJobs: () => ({ cronjobs: [], isDemoFallback: null }),
  useCachedIngresses: () => ({ ingresses: [], isDemoFallback: null }),
  useCachedNetworkPolicies: () => ({ networkpolicies: [], isDemoFallback: null }),
}))

vi.mock('../../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: [], isAllClustersSelected: null }),
}))

vi.mock('../../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToNamespace: vi.fn(), drillToPod: vi.fn(), drillToCluster: vi.fn(), drillToDeployment: vi.fn(), drillToService: vi.fn(), drillToPVC: null }),
}))

vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: () => ({ data: [], isLoading: false, error: null }),
  useCardLoadingState: () => ({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false }),
}))

vi.mock('../../../../lib/cards/cardHooks', () => ({
  useChartFilters: () => ({ localClusterFilter: [], toggleClusterFilter: vi.fn(), clearClusterFilter: vi.fn(), availableClusters: [], showClusterFilter: false, setShowClusterFilter: vi.fn(), clusterFilterRef: { current: null } }),
}))

import { ClusterResourceTree } from '../ClusterResourceTree'

describe('ClusterResourceTree', () => {
  it('renders without crashing', () => {
    const { container } = render(<ClusterResourceTree />)
    expect(container).toBeTruthy()
  })
})
