/**
 * Clusters Page Component Tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useLocation: () => ({ pathname: '/clusters', search: '' }),
  useNavigate: () => vi.fn(),
}))

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => ({ deduplicatedClusters: [], isLoading: false, isRefreshing: false, lastUpdated: null, refetch: vi.fn() }),
  useGPUNodes: () => ({ nodes: [], isLoading: false, error: null, refetch: vi.fn() }),
  useNVIDIAOperators: () => ({ operators: [] }),
  refreshSingleCluster: vi.fn(),
}))

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: vi.fn() }),
}))

vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ isConnected: false, status: 'disconnected' }),
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: true }),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: [], selectedNamespaces: [] }),
}))

vi.mock('../../../hooks/usePermissions', () => ({
  usePermissions: () => ({ canWrite: true }),
}))

vi.mock('../../../lib/unified/demo', () => ({
  useIsModeSwitching: () => false,
}))

vi.mock('../../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: () => null,
}))

vi.mock('../../../config/dashboards', () => ({
  getDefaultCards: () => [],
}))

vi.mock('../../../hooks/useBackendHealth', () => ({
  isInClusterMode: () => false,
}))

vi.mock('../../cards/console-missions/shared', () => ({
  useApiKeyCheck: () => ({
    showKeyPrompt: false,
    checkKeyAndRun: vi.fn(),
    goToSettings: vi.fn(),
    dismissPrompt: vi.fn(),
  }),
  ApiKeyPromptModal: () => null,
}))

vi.mock('../../cards/multi-tenancy/missionLoader', () => ({
  loadMissionPrompt: vi.fn(),
}))

vi.mock('../../../lib/analytics', () => ({
  emitClusterStatsDrillDown: vi.fn(),
}))

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8080',
  STORAGE_KEY_CLUSTER_LAYOUT: 'kc-cluster-layout',
  STORAGE_KEY_CLUSTER_ORDER: 'kc-cluster-order',
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
} })

vi.mock('../../../lib/utils/localStorage', () => ({
  safeGetItem: () => null,
  safeSetItem: vi.fn(),
}))

vi.mock('../../../lib/modals', () => ({
  useModalState: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}))

vi.mock('../../../hooks/useUniversalStats', () => ({
  useUniversalStats: () => ({ getStatValue: vi.fn() }),
  createMergedStatValueGetter: vi.fn(),
}))

vi.mock('../../../lib/formatStats', () => ({
  formatMemoryStat: vi.fn(),
}))

vi.mock('../../ui/RotatingTip', () => ({
  RotatingTip: () => null,
}))

vi.mock('../useClusterFiltering', () => ({
  useClusterFiltering: () => ({ filteredClusters: [], filter: 'all', setFilter: vi.fn() }),
}))

vi.mock('../useClusterStats', () => ({
  useClusterStats: () => ({ total: 0, healthy: 0, unhealthy: 0, unreachable: 0 }),
}))

vi.mock('../ClusterGroupsSection', () => ({
  ClusterGroupsSection: () => null,
}))

vi.mock('../ClusterDetailModal', () => ({
  ClusterDetailModal: () => null,
}))

vi.mock('../AddClusterDialog', () => ({
  AddClusterDialog: () => null,
}))

vi.mock('../EmptyClusterState', () => ({
  EmptyClusterState: () => <div>No clusters</div>,
}))

vi.mock('../components', () => ({
  RenameModal: () => null,
  FilterTabs: () => null,
  ClusterGrid: () => null,
  GPUDetailModal: () => null,
}))

vi.mock('../../ui/ClusterCardSkeleton', () => ({
  ClusterCardSkeleton: () => null,
}))

describe('Clusters', () => {
  it('exports Clusters component', async () => {
    const mod = await import('../Clusters')
    expect(mod.Clusters).toBeDefined()
    expect(typeof mod.Clusters).toBe('function')
  })
})
