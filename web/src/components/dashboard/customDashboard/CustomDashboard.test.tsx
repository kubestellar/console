import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useParams: () => ({ id: 'dash-1' }),
  useLocation: () => ({ pathname: '/custom-dashboard/dash-1' }),
}))

vi.mock('../../../hooks/useSidebarConfig', () => ({
  useSidebarConfig: () => ({
    config: { primaryNav: [], secondaryNav: [] },
    removeItem: vi.fn(),
  }),
}))

vi.mock('../../../lib/modals', () => ({
  useModalState: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}))

vi.mock('./useDashboardStats', () => ({
  useDashboardStats: () => ({
    deduplicatedClusters: [],
    isClustersLoading: false,
    getDashboardStatValue: vi.fn(),
  }),
}))

vi.mock('./useDashboardDragDrop', () => ({
  useDashboardDragDrop: () => ({
    activeId: null,
    sensors: [],
    collisionDetection: vi.fn(),
    handleDragStart: vi.fn(),
    handleDragEnd: vi.fn(),
  }),
}))

const useDashboardData = vi.fn()
vi.mock('./useDashboardData', () => ({
  useDashboardData: (...args: unknown[]) => useDashboardData(...args),
}))

vi.mock('../AddCardModal', () => ({ AddCardModal: () => <div data-testid="add-card-modal" /> }))
vi.mock('../ConfigureCardModal', () => ({ ConfigureCardModal: () => <div data-testid="configure-card-modal" /> }))
vi.mock('../CardRecommendations', () => ({ CardRecommendations: () => <div data-testid="card-recommendations" /> }))
vi.mock('../MissionSuggestions', () => ({ MissionSuggestions: () => <div data-testid="mission-suggestions" /> }))
vi.mock('../TemplatesModal', () => ({ TemplatesModal: () => <div data-testid="templates-modal" /> }))
vi.mock('../FloatingDashboardActions', () => ({ FloatingDashboardActions: () => <div data-testid="floating-actions" /> }))
vi.mock('../../ui/StatsOverview', () => ({ StatsOverview: () => <div data-testid="stats-overview" /> }))
vi.mock('../../shared/DashboardHeader', () => ({
  DashboardHeader: ({ title }: { title: string }) => <div data-testid="dashboard-header">{title}</div>,
}))
vi.mock('../DashboardHealthIndicator', () => ({ DashboardHealthIndicator: () => <div data-testid="health-indicator" /> }))
vi.mock('./DashboardEmptyState', () => ({ DashboardEmptyState: () => <div data-testid="empty-state" /> }))
vi.mock('./DashboardDeleteModal', () => ({ DashboardDeleteModal: () => <div data-testid="delete-modal" /> }))
vi.mock('./CardGrid', () => ({ CardGrid: () => <div data-testid="card-grid" /> }))

import { CustomDashboard } from './CustomDashboard'

const baseDashboardData = {
  dashboard: { name: 'My Dashboard' },
  cards: [],
  setCards: vi.fn(),
  cardsRef: { current: [] },
  isLoading: false,
  isRefreshing: false,
  isFetching: false,
  autoRefresh: false,
  setAutoRefresh: vi.fn(),
  lastUpdated: null,
  triggerRefresh: vi.fn(),
  selectedCard: null,
  setSelectedCard: vi.fn(),
  setInsertAtIndex: vi.fn(),
  snapshot: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  canUndo: false,
  canRedo: false,
  handleExportDashboard: vi.fn(),
  handleImportDashboard: vi.fn(),
  handleAddCards: vi.fn(),
  handleRemoveCard: vi.fn(),
  handleConfigureCard: vi.fn(),
  handleCardConfigured: vi.fn(),
  handleWidthChange: vi.fn(),
  handleHeightChange: vi.fn(),
  handleApplyTemplate: vi.fn(),
  handleAddRecommendedCard: vi.fn(),
  handleReset: vi.fn(),
  handleDeleteDashboard: vi.fn(),
}

describe('CustomDashboard Component', () => {
  it('exports CustomDashboard component', () => {
    expect(CustomDashboard).toBeDefined()
    expect(typeof CustomDashboard).toBe('function')
  })

  it('renders a loading skeleton while loading with no cards', () => {
    useDashboardData.mockReturnValue({ ...baseDashboardData, isLoading: true, cards: [] })

    render(<MemoryRouter><CustomDashboard /></MemoryRouter>)

    expect(screen.queryByTestId('dashboard-header')).not.toBeInTheDocument()
    expect(screen.queryByTestId('card-grid')).not.toBeInTheDocument()
  })

  it('renders the dashboard header with the dashboard name once loaded', () => {
    useDashboardData.mockReturnValue({ ...baseDashboardData })

    render(<MemoryRouter><CustomDashboard /></MemoryRouter>)

    expect(screen.getByTestId('dashboard-header')).toHaveTextContent('My Dashboard')
  })

  it('renders the empty state when there are no cards', () => {
    useDashboardData.mockReturnValue({ ...baseDashboardData, cards: [] })

    render(<MemoryRouter><CustomDashboard /></MemoryRouter>)

    expect(screen.getByTestId('empty-state')).toBeVisible()
    expect(screen.queryByTestId('card-grid')).not.toBeInTheDocument()
  })

  it('renders the card grid when cards are present', () => {
    useDashboardData.mockReturnValue({
      ...baseDashboardData,
      cards: [{ id: 'card-1', card_type: 'cluster_health', config: {}, position: { x: 0, y: 0, w: 4, h: 2 } }],
    })

    render(<MemoryRouter><CustomDashboard /></MemoryRouter>)

    expect(screen.getByTestId('card-grid')).toBeVisible()
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
  })
})
