import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Clusters } from '../Clusters'

type StatValue = {
  value: string | number
  sublabel?: string
  max?: number
  isClickable?: boolean
}

type DashboardPageProps = {
  getStatValue: (blockId: string) => StatValue
}

const {
  mockDashboardPage,
  mockUseClusters,
  mockUseGPUNodes,
  mockUseClusterStats,
} = vi.hoisted(() => ({
  mockDashboardPage: vi.fn(),
  mockUseClusters: vi.fn(),
  mockUseGPUNodes: vi.fn(),
  mockUseClusterStats: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useLocation: () => ({ pathname: '/clusters', key: 'clusters-route' }),
  useNavigate: () => vi.fn(),
}))

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: mockUseClusters,
  useGPUNodes: mockUseGPUNodes,
  useNVIDIAOperators: () => ({ operators: [] }),
  refreshSingleCluster: vi.fn(),
}))

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: vi.fn(), openSidebar: vi.fn() }),
}))

vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ isConnected: true, isDegraded: false, status: 'connected' }),
  wasAgentEverConnected: () => true,
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: true }),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [],
    isAllClustersSelected: true,
    customFilter: 'all',
    clusterGroups: [],
    addClusterGroup: vi.fn(),
    deleteClusterGroup: vi.fn(),
    selectClusterGroup: vi.fn(),
    selectedDistributions: [],
    isAllDistributionsSelected: true,
  }),
}))

vi.mock('../../../hooks/usePermissions', () => ({
  usePermissions: () => ({ isClusterAdmin: () => true, loading: false }),
}))

vi.mock('../../../lib/unified/demo', () => ({
  useIsModeSwitching: () => false,
}))

vi.mock('../../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: (props: unknown) => {
    mockDashboardPage(props)
    return null
  },
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
  const actual = await importOriginal<typeof import('../../../lib/constants')>()
  return {
    ...actual,
    LOCAL_AGENT_HTTP_URL: 'http://localhost:8080',
    STORAGE_KEY_CLUSTER_LAYOUT: 'kc-cluster-layout',
    STORAGE_KEY_CLUSTER_ORDER: 'kc-cluster-order',
    FETCH_DEFAULT_TIMEOUT_MS: 5000,
  }
})

vi.mock('../../../lib/utils/localStorage', () => ({
  safeGetItem: () => null,
  safeSetItem: vi.fn(),
}))

vi.mock('../../../lib/modals', () => ({
  useModalState: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}))

vi.mock('../../../lib/formatStats', () => ({
  formatMemoryStat: (value: number) => `${value} GiB`,
}))

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../../ui/RotatingTip', () => ({
  RotatingTip: () => null,
}))

vi.mock('../useClusterFiltering', () => ({
  useClusterFiltering: () => ({ filteredClusters: [], globalFilteredClusters: [] }),
}))

vi.mock('../useClusterStats', () => ({
  useClusterStats: mockUseClusterStats,
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
  EmptyClusterState: () => null,
}))

vi.mock('../components', () => ({
  RenameModal: () => null,
  RemoveClusterDialog: () => null,
  FilterTabs: () => null,
  ClusterGrid: () => null,
  GPUDetailModal: () => null,
}))

vi.mock('../../ui/ClusterCardSkeleton', () => ({
  ClusterCardSkeleton: () => null,
}))

describe('Clusters progress scaling', () => {
  beforeEach(() => {
    mockDashboardPage.mockClear()
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [{ name: 'cluster-a' }, { name: 'cluster-b' }],
      isLoading: false,
      isRefreshing: false,
      lastUpdated: null,
      refetch: vi.fn(),
    })
    mockUseGPUNodes.mockReturnValue({
      nodes: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    mockUseClusterStats.mockReturnValue({
      total: 12,
      healthy: 11,
      unhealthy: 1,
      unreachable: 0,
      totalNodes: 24,
      totalCPUs: 96,
      totalMemoryGB: 128,
      totalStorageGB: 512,
      totalPods: 240,
      totalGPUs: 0,
      staleContexts: 0,
      hasResourceData: true,
    })
  })

  it('passes total cluster count as the progress max for health summary stats', () => {
    render(<Clusters />)

    const props = mockDashboardPage.mock.calls.at(-1)?.[0] as DashboardPageProps

    expect(props.getStatValue('healthy')).toMatchObject({ value: 11, max: 12 })
    expect(props.getStatValue('unhealthy')).toMatchObject({ value: 1, max: 12 })
    expect(props.getStatValue('unreachable')).toMatchObject({ value: 0, max: 12 })
  })

  it('keeps raw-count stats in numeric mode unless they provide a real denominator', () => {
    render(<Clusters />)

    const props = mockDashboardPage.mock.calls.at(-1)?.[0] as DashboardPageProps

    expect(props.getStatValue('pods')).toMatchObject({ value: 240 })
    expect(props.getStatValue('pods').max).toBeUndefined()
  })
})
