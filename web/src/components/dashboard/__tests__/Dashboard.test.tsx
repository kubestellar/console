/**
 * Deep branch-coverage tests for Dashboard.tsx logic
 *
 * The Dashboard component has ~80 hooks and effects that create complex
 * dependency chains in tests. We test the key logic branches by testing
 * the helper functions and sub-patterns directly, plus a minimal render.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { type ReactNode } from 'react'

// ── Minimal mock surface ────────────────────────────────────────────
const mockSafeGetItem = vi.fn().mockReturnValue(null)
const mockSafeSetItem = vi.fn()
const mockSafeGetJSON = vi.fn().mockReturnValue(null)
const mockSafeSetJSON = vi.fn()

vi.mock('../../../lib/utils/localStorage', () => ({
  safeGetItem: (...args: unknown[]) => mockSafeGetItem(...args),
  safeSetItem: (...args: unknown[]) => mockSafeSetItem(...args),
  safeGetJSON: (...args: unknown[]) => mockSafeGetJSON(...args),
  safeSetJSON: (...args: unknown[]) => mockSafeSetJSON(...args),
}))

const mockApiGet = vi.fn().mockResolvedValue({ data: [] })
vi.mock('../../../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
  BackendUnavailableError: class extends Error {},
  UnauthenticatedError: class extends Error {},
}))

vi.mock('../../../lib/analytics', () => ({
  emitCardAdded: vi.fn(),
  emitCardRemoved: vi.fn(),
  emitCardDragged: vi.fn(),
  emitCardConfigured: vi.fn(),
}))

const mockLocation = { pathname: '/', key: 'default', search: '', hash: '', state: null }
vi.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mockClusters = [
  { name: 'prod', healthy: true, podCount: 50, nodeCount: 3, namespaces: ['default', 'kube-system'] },
  { name: 'staging', healthy: false, podCount: 20, nodeCount: 1, namespaces: ['default'] },
]
vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => ({
    deduplicatedClusters: mockClusters,
    clusters: mockClusters,
    isRefreshing: false,
    lastUpdated: new Date(),
    refetch: vi.fn(),
    isLoading: false,
    error: null,
  }),
}))

vi.mock('../../../hooks/useDashboards', () => ({
  useDashboards: () => ({
    dashboards: [{ id: 'd1', name: 'Main', is_default: true }],
    moveCardToDashboard: vi.fn(),
    createDashboard: vi.fn(),
    exportDashboard: vi.fn(),
    importDashboard: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useCardHistory', () => ({
  useCardHistory: () => ({
    recordCardRemoved: vi.fn(),
    recordCardAdded: vi.fn(),
    recordCardConfigured: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToCluster: vi.fn(),
    drillToAllClusters: vi.fn(),
    drillToAllNodes: vi.fn(),
    drillToAllPods: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useDashboardContext', () => ({
  useDashboardContext: () => ({
    isAddCardModalOpen: false,
    closeAddCardModal: vi.fn(),
    openAddCardModal: vi.fn(),
    pendingOpenAddCardModal: false,
    setPendingOpenAddCardModal: vi.fn(),
    isTemplatesModalOpen: false,
    closeTemplatesModal: vi.fn(),
    openTemplatesModal: vi.fn(),
    pendingRestoreCard: null,
    clearPendingRestoreCard: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ openSidebar: vi.fn(), startMission: vi.fn() }),
}))

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../../cards/cardRegistry', () => ({
  CARD_COMPONENTS: {},
  prefetchCardChunks: vi.fn(),
}))

vi.mock('../../../config/routes', () => ({
  ROUTES: { CLUSTERS: '/clusters', NAMESPACES: '/namespaces', ALERTS: '/alerts' },
}))

vi.mock('../../../config/dashboards', () => ({
  getDefaultCardsForDashboard: () => [
    { id: 'default-1', card_type: 'cluster_health', config: {}, position: { x: 0, y: 0, w: 4, h: 2 } },
    { id: 'default-2', card_type: 'pod_issues', config: {}, position: { x: 4, y: 0, w: 4, h: 2 } },
  ],
}))

vi.mock('../../../lib/safeLazy', () => ({
  safeLazy: () => {
    const Comp = (props: Record<string, unknown>) => props.isOpen ? <div data-testid="lazy-modal" /> : null
    return Comp
  },
}))

vi.mock('../../../hooks/useDashboardReset', () => ({
  useDashboardReset: () => ({ reset: vi.fn(), isCustomized: false }),
}))

vi.mock('../../../hooks/useUndoRedo', () => ({
  useDashboardUndoRedo: () => ({ snapshot: vi.fn(), undo: vi.fn(), redo: vi.fn(), canUndo: false, canRedo: false }),
}))

vi.mock('../../../hooks/useContextualNudges', () => ({
  useContextualNudges: () => ({
    activeNudge: null, showDragHint: false, dismissNudge: vi.fn(), actionNudge: vi.fn(), recordVisit: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useDashboardScrollTracking', () => ({ useDashboardScrollTracking: vi.fn() }))
vi.mock('../../../hooks/useUniversalStats', () => ({
  useUniversalStats: () => ({ getStatValue: () => ({ value: 0 }) }),
  createMergedStatValueGetter: (primary: (id: string) => unknown) => primary,
}))
vi.mock('../../../lib/cardEvents', () => ({ useCardPublish: () => vi.fn() }))
vi.mock('../../../hooks/useWorkloads', () => ({ useDeployWorkload: () => ({ mutate: vi.fn() }) }))
vi.mock('../../../hooks/useCardGridNavigation', () => ({
  useCardGridNavigation: () => ({ registerCardRef: vi.fn(), handleGridKeyDown: vi.fn() }),
}))
vi.mock('../../../lib/modals', () => ({
  useModalState: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}))
vi.mock('../../../lib/cache', () => ({ setAutoRefreshPaused: vi.fn() }))
vi.mock('../../../hooks/useRefreshIndicator', () => ({
  useRefreshIndicator: (fn: () => void) => ({ showIndicator: false, triggerRefresh: fn }),
}))
vi.mock('../../../hooks/useDemoMode', () => ({ getDemoMode: () => false }))

// Mock child components as minimal stubs
vi.mock('../DashboardDropZone', () => ({ DashboardDropZone: () => <div data-testid="drop-zone" /> }))
vi.mock('../CardRecommendations', () => ({ CardRecommendations: () => <div data-testid="card-recs" /> }))
vi.mock('../MissionSuggestions', () => ({ MissionSuggestions: () => null }))
vi.mock('../GettingStartedBanner', () => ({ GettingStartedBanner: () => <div data-testid="getting-started" /> }))
vi.mock('../../layout/SidebarCustomizer', () => ({ SidebarCustomizer: () => null }))
vi.mock('../TemplatesModal', () => ({ TemplatesModal: () => null }))
vi.mock('../CreateDashboardModal', () => ({ CreateDashboardModal: () => null }))
vi.mock('../FloatingDashboardActions', () => ({
  FloatingDashboardActions: () => <div data-testid="floating-actions" />,
}))
vi.mock('../SharedSortableCard', () => ({
  SortableCard: ({ card }: { card: { id: string; card_type: string } }) => (
    <div data-testid={`card-${card.id}`} data-card-type={card.card_type} />
  ),
  DragPreviewCard: () => null,
}))
vi.mock('../PostConnectBanner', () => ({ PostConnectBanner: () => null }))
vi.mock('../AdopterNudge', () => ({ AdopterNudge: () => null }))
vi.mock('../DemoToLocalCTA', () => ({ DemoToLocalCTA: () => null }))
vi.mock('../ContextualNudgeBanner', () => ({ ContextualNudgeBanner: () => null }))
vi.mock('../DiscoverCardsPlaceholder', () => ({ DiscoverCardsPlaceholder: () => <div data-testid="discover" /> }))
vi.mock('../../widgets/WidgetExportModal', () => ({ WidgetExportModal: () => null }))
vi.mock('../../deploy/DeployConfirmDialog', () => ({ DeployConfirmDialog: () => null }))
vi.mock('../DashboardHealthIndicator', () => ({ DashboardHealthIndicator: () => null }))
vi.mock('../WelcomeCard', () => ({ WelcomeCard: () => <div data-testid="welcome-card" /> }))
vi.mock('../../shared/DashboardHeader', () => ({
  DashboardHeader: ({ title }: { title: string }) => <div data-testid="dashboard-header">{title}</div>,
}))
vi.mock('../../ui/StatsOverview', () => ({
  StatsOverview: () => <div data-testid="stats-overview" />,
  StatBlockValue: {},
}))
vi.mock('../dashboardUtils', () => ({
  isLocalOnlyCard: (id: string) => /^(new|demo|rec|template|restored|ai|default)-/.test(id),
  mapVisualizationToCardType: (_v: string, type: string) => type,
  getDefaultCardSize: () => ({ w: 4, h: 2 }),
  getDemoCards: () => [
    { id: 'demo-1', card_type: 'cluster_health', config: {}, position: { x: 0, y: 0, w: 4, h: 2 } },
  ],
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  pointerWithin: vi.fn().mockReturnValue([]),
  rectIntersection: vi.fn().mockReturnValue([]),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn().mockReturnValue({}),
  useSensors: vi.fn().mockReturnValue([]),
  DragOverlay: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: (arr: unknown[], from: number, to: number) => {
    const r = [...arr as unknown[]]; const [i] = r.splice(from, 1); r.splice(to, 0, i); return r
  },
  SortableContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  rectSortingStrategy: {},
}))

import { Dashboard } from '../Dashboard'

describe('Dashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.clearAllMocks()
    mockSafeGetItem.mockReturnValue(null)
    mockSafeGetJSON.mockReturnValue(null)
    mockLocation.pathname = '/'
    mockLocation.key = 'test-key'

    // Return empty dashboards to avoid recursive API calls
    mockApiGet.mockResolvedValue({ data: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the dashboard page with data-testid', async () => {
    render(<Dashboard />)
    // Dashboard renders synchronously with default cards from config
    expect(screen.getByTestId('dashboard-page')).toBeInTheDocument()
  })

  it('renders header, stats, and getting-started banner', () => {
    render(<Dashboard />)
    expect(screen.getByTestId('dashboard-header')).toBeInTheDocument()
    expect(screen.getByTestId('stats-overview')).toBeInTheDocument()
    expect(screen.getByTestId('getting-started')).toBeInTheDocument()
  })

  it('renders default cards from config when localStorage is empty', () => {
    render(<Dashboard />)
    expect(screen.getByTestId('card-default-1')).toBeInTheDocument()
    expect(screen.getByTestId('card-default-2')).toBeInTheDocument()
  })

  it('renders cards from localStorage when available', () => {
    mockSafeGetJSON.mockReturnValue([
      { id: 'local-1', card_type: 'gpu_overview', config: {}, position: { x: 0, y: 0, w: 4, h: 2 } },
    ])
    render(<Dashboard />)
    expect(screen.getByTestId('card-local-1')).toBeInTheDocument()
  })

  it('renders floating actions', () => {
    render(<Dashboard />)
    expect(screen.getByTestId('floating-actions')).toBeInTheDocument()
  })

  it('renders card recommendations', () => {
    render(<Dashboard />)
    expect(screen.getByTestId('card-recs')).toBeInTheDocument()
  })

  it('renders discover placeholder when not customized', () => {
    render(<Dashboard />)
    expect(screen.getByTestId('discover')).toBeInTheDocument()
  })

  it('persists auto-refresh true by default', () => {
    render(<Dashboard />)
    expect(mockSafeSetItem).toHaveBeenCalledWith('dashboard-auto-refresh', 'true')
  })

  it('reads auto-refresh=false from localStorage', () => {
    mockSafeGetItem.mockImplementation((key: string) =>
      key === 'dashboard-auto-refresh' ? 'false' : null
    )
    render(<Dashboard />)
    expect(mockSafeSetItem).toHaveBeenCalledWith('dashboard-auto-refresh', 'false')
  })

  it('persists cards to localStorage', async () => {
    render(<Dashboard />)
    await waitFor(() => {
      expect(mockSafeSetJSON).toHaveBeenCalledWith(
        'kubestellar-main-dashboard-cards',
        expect.any(Array)
      )
    })
  })

  it('calls API to load dashboards when on home route', async () => {
    render(<Dashboard />)
    await vi.advanceTimersByTimeAsync(100)
    expect(mockApiGet).toHaveBeenCalledWith('/api/dashboards')
  })

  it('does NOT call API when pathname is not home', async () => {
    mockLocation.pathname = '/clusters'
    render(<Dashboard />)
    await vi.advanceTimersByTimeAsync(100)
    expect(mockApiGet).not.toHaveBeenCalledWith('/api/dashboards')
  })

  it('shows drop zone component', () => {
    render(<Dashboard />)
    expect(screen.getByTestId('drop-zone')).toBeInTheDocument()
  })
})
