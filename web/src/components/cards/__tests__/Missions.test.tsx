import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Missions } from '../Missions'
import type { DeployMission } from '../../../hooks/useDeployMissions'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (k: string, fallback?: string) => fallback ?? k,
  }),
}))

const mockUseDeployMissions = vi.fn()
vi.mock('../../../hooks/useDeployMissions', () => ({
  useDeployMissions: () => mockUseDeployMissions(),
}))

const mockUseClusters = vi.fn()
vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

const mockIsDemoMode = vi.fn(() => false)
vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode() }),
  isDemoModeForced: () => false,
  getDemoMode: () => false,
  canToggleDemoMode: () => true,
  isNetlifyDeployment: () => false,
  isDemoToken: () => false,
  hasRealToken: () => true,
  setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

const mockStartMission = vi.fn()
const mockAiMissions = vi.fn(() => [] as unknown[])
vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: mockStartMission, missions: mockAiMissions() }),
}))

const mockCheckKeyAndRun = vi.fn((fn: () => void) => fn())
vi.mock('../console-missions/shared', () => ({
  useApiKeyCheck: () => ({
    showKeyPrompt: false,
    checkKeyAndRun: mockCheckKeyAndRun,
    goToSettings: vi.fn(),
    dismissPrompt: vi.fn(),
  }),
  ApiKeyPromptModal: () => null,
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

const mockUseCardData = vi.fn()
vi.mock('../../../lib/cards/cardHooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/cards/cardHooks')>()
  return {
    ...actual,
    useCardData: (data: DeployMission[]) => mockUseCardData(data),
  }
})

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardControlsRow: () => <div data-testid="card-controls-row" />,
  CardSearchInput: ({
    value,
    onChange,
  }: {
    value: string
    onChange: (v: string) => void
  }) => (
    <input
      data-testid="search-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
  CardPaginationFooter: ({ needsPagination }: { needsPagination: boolean }) =>
    needsPagination ? <div data-testid="pagination" /> : null,
  CardEmptyState: ({
    title,
    message,
  }: {
    title?: string
    message?: string
    icon?: unknown
  }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      {message && <span>{message}</span>}
    </div>
  ),
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => (
    <span data-testid="cluster-badge">{cluster}</span>
  ),
  getClusterInfo: (name: string) => ({ name, provider: 'unknown' }),
}))

vi.mock('../../../lib/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMission(overrides: Partial<DeployMission> = {}): DeployMission {
  return {
    id: 'mission-1',
    workload: 'nginx-frontend',
    namespace: 'production',
    sourceCluster: 'eks-prod',
    targetClusters: ['openshift-prod'],
    groupName: 'production',
    status: 'orbit',
    clusterStatuses: [
      { cluster: 'openshift-prod', status: 'running', replicas: 3, readyReplicas: 3 },
    ],
    startedAt: Date.now() - 300_000,
    completedAt: Date.now() - 240_000,
    ...overrides,
  }
}

function makeCardDataReturn(missions: DeployMission[]) {
  return {
    items: missions,
    totalItems: missions.length,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 5,
    goToPage: vi.fn(),
    needsPagination: false,
    setItemsPerPage: vi.fn(),
    filters: {
      search: '',
      setSearch: vi.fn(),
      localClusterFilter: [],
      toggleClusterFilter: vi.fn(),
      clearClusterFilter: vi.fn(),
      availableClusters: [],
      showClusterFilter: false,
      setShowClusterFilter: vi.fn(),
      clusterFilterRef: { current: null },
    },
    sorting: {
      sortBy: 'status',
      setSortBy: vi.fn(),
      sortDirection: 'asc',
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: {},
  }
}

function setupDefaults({
  missions = [] as DeployMission[],
  activeMissions = [] as DeployMission[],
  completedMissions = [] as DeployMission[],
  clusters = [] as { name: string; reachable: boolean }[],
  isLoading = false,
  isRefreshing = false,
  isFailed = false,
  consecutiveFailures = 0,
  isDemoMode = false,
} = {}) {
  mockIsDemoMode.mockReturnValue(isDemoMode)
  mockUseDeployMissions.mockReturnValue({
    missions,
    activeMissions,
    completedMissions,
    hasActive: activeMissions.length > 0,
    clearCompleted: vi.fn(),
  })
  mockUseClusters.mockReturnValue({
    deduplicatedClusters: clusters,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    error: null,
    lastRefresh: null,
  })
  mockUseCardLoadingState.mockReturnValue({})
  // useCardData passes through the mission list (rawMissions from the component)
  mockUseCardData.mockImplementation((data: DeployMission[]) => makeCardDataReturn(data))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Missions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaults()
  })

  // -------------------------------------------------------------------------
  describe('empty state', () => {
    it('shows empty state when no missions are returned', () => {
      setupDefaults({ missions: [], isDemoMode: false })
      render(<Missions />)
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
      expect(screen.getByText('cards:missionsCard.noMissionsFound')).toBeInTheDocument()
    })

    it('shows empty state with deploy hint when no filters are active', () => {
      setupDefaults({ missions: [] })
      render(<Missions />)
      expect(screen.getByText('Deploy a workload to start a mission')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('demo mode', () => {
    it('renders the two DEMO_MISSIONS workload names when demoMode=true', () => {
      setupDefaults({ isDemoMode: true })
      render(<Missions />)
      expect(screen.getByText('nginx-frontend')).toBeInTheDocument()
      expect(screen.getByText('api-gateway')).toBeInTheDocument()
    })

    it('passes isDemoData=true (demoMode) to useCardLoadingState', () => {
      setupDefaults({ isDemoMode: true })
      render(<Missions />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true }),
      )
    })

    it('passes isDemoData=false when not in demo mode', () => {
      setupDefaults({ isDemoMode: false, missions: [makeMission()] })
      render(<Missions />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: false }),
      )
    })
  })

  // -------------------------------------------------------------------------
  describe('live mission list', () => {
    it('renders workload name for a live mission', () => {
      const mission = makeMission({ workload: 'my-app', status: 'orbit' })
      setupDefaults({ missions: [mission] })
      render(<Missions />)
      expect(screen.getByText('my-app')).toBeInTheDocument()
    })

    it('renders namespace for a live mission', () => {
      const mission = makeMission({ namespace: 'my-namespace' })
      setupDefaults({ missions: [mission] })
      render(<Missions />)
      expect(screen.getByText('my-namespace')).toBeInTheDocument()
    })

    it('renders multiple missions', () => {
      const missions = [
        makeMission({ id: 'a', workload: 'service-alpha' }),
        makeMission({ id: 'b', workload: 'service-beta' }),
      ]
      setupDefaults({ missions })
      render(<Missions />)
      expect(screen.getByText('service-alpha')).toBeInTheDocument()
      expect(screen.getByText('service-beta')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('expand/collapse', () => {
    it('mission row renders with expand/collapse button', () => {
      const mission = makeMission({ workload: 'expandable-app' })
      setupDefaults({ missions: [mission] })
      render(<Missions />)
      expect(
        screen.getByRole('button', { name: /Expand mission expandable-app in production/ }),
      ).toBeInTheDocument()
    })

    it('toggles expanded state when mission row is clicked', async () => {
      const mission = makeMission({ workload: 'toggle-app' })
      setupDefaults({ missions: [mission] })
      render(<Missions />)
      const toggle = screen.getByRole('button', { name: /Expand mission toggle-app/ })
      await userEvent.click(toggle)
      expect(
        screen.getByRole('button', { name: /Collapse mission toggle-app/ }),
      ).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('AI handlers — handleDiagnose / handleRepair guard', () => {
    it('does NOT call startMission when mission.targetClusters is empty (Diagnose)', async () => {
      const mission = makeMission({
        id: 'failed-1',
        workload: 'broken-app',
        status: 'abort',
        targetClusters: [],    // ← the bug we fixed
        clusterStatuses: [{ cluster: 'prod', status: 'failed', replicas: 1, readyReplicas: 0 }],
      })
      setupDefaults({ missions: [mission] })
      render(<Missions />)
      await userEvent.click(screen.getByRole('button', { name: /Diagnose/ }))
      expect(mockStartMission).not.toHaveBeenCalled()
    })

    it('does NOT call startMission when mission.targetClusters is empty (Repair)', async () => {
      const mission = makeMission({
        id: 'failed-2',
        workload: 'broken-app',
        status: 'abort',
        targetClusters: [],    // ← the bug we fixed
        clusterStatuses: [{ cluster: 'prod', status: 'failed', replicas: 1, readyReplicas: 0 }],
      })
      setupDefaults({ missions: [mission] })
      render(<Missions />)
      await userEvent.click(screen.getByRole('button', { name: /Repair/ }))
      expect(mockStartMission).not.toHaveBeenCalled()
    })

    it('calls startMission with Diagnose config when targetClusters is non-empty', async () => {
      const mission = makeMission({
        id: 'failed-3',
        workload: 'fixable-app',
        status: 'abort',
        targetClusters: ['openshift-prod'],
        clusterStatuses: [{ cluster: 'openshift-prod', status: 'failed', replicas: 2, readyReplicas: 0 }],
      })
      setupDefaults({ missions: [mission] })
      render(<Missions />)
      await userEvent.click(screen.getByRole('button', { name: /Diagnose/ }))
      expect(mockStartMission).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Diagnose fixable-app',
          type: 'troubleshoot',
          cluster: 'openshift-prod',
        }),
      )
    })

    it('calls startMission with Repair config when targetClusters is non-empty', async () => {
      const mission = makeMission({
        id: 'failed-4',
        workload: 'fixable-app',
        status: 'abort',
        targetClusters: ['aks-staging'],
        clusterStatuses: [{ cluster: 'aks-staging', status: 'failed', replicas: 1, readyReplicas: 0 }],
      })
      setupDefaults({ missions: [mission] })
      render(<Missions />)
      await userEvent.click(screen.getByRole('button', { name: /Repair/ }))
      expect(mockStartMission).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Repair fixable-app',
          type: 'repair',
          cluster: 'aks-staging',
        }),
      )
    })

    it('Diagnose/Repair buttons are only shown for abort or partial missions', () => {
      // orbit missions should NOT show the AI action buttons
      const mission = makeMission({ status: 'orbit' })
      setupDefaults({ missions: [mission] })
      render(<Missions />)
      expect(screen.queryByRole('button', { name: /Diagnose/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Repair/ })).not.toBeInTheDocument()
    })

    it('both AI buttons are visible for partial-status missions', () => {
      const mission = makeMission({
        status: 'partial',
        targetClusters: ['prod'],
        clusterStatuses: [{ cluster: 'prod', status: 'failed', replicas: 2, readyReplicas: 1 }],
      })
      setupDefaults({ missions: [mission] })
      render(<Missions />)
      expect(screen.getByRole('button', { name: /Diagnose/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Repair/ })).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('useCardLoadingState integration', () => {
    it('passes isLoading from useClusters', () => {
      setupDefaults({ isLoading: true })
      render(<Missions />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isLoading: true }),
      )
    })

    it('passes isRefreshing from useClusters', () => {
      setupDefaults({ missions: [makeMission()], isRefreshing: true })
      render(<Missions />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isRefreshing: true }),
      )
    })

    it('passes hasAnyData=true when missions exist', () => {
      setupDefaults({ missions: [makeMission()] })
      render(<Missions />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ hasAnyData: true }),
      )
    })

    it('passes hasAnyData=false when no missions and no clusters', () => {
      setupDefaults({ missions: [], clusters: [] })
      render(<Missions />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ hasAnyData: false }),
      )
    })

    it('passes hasAnyData=true when clusters exist even without missions', () => {
      setupDefaults({
        missions: [],
        clusters: [{ name: 'prod', reachable: true }],
      })
      render(<Missions />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ hasAnyData: true }),
      )
    })
  })
})
