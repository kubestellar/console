import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Use fake timers to prevent real intervals/timeouts from hanging the worker
vi.useFakeTimers()

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => { },
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))
vi.mock('../../hooks/useDemoMode', () => ({
  getDemoMode: () => true,
  default: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false,
  isDemoModeForced: false,
  isNetlifyDeployment: false,
  canToggleDemoMode: () => true,
  isDemoToken: () => true,
  setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))
vi.mock('../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitAddCardModalAbandoned: vi.fn(),
  emitCardCategoryBrowsed: vi.fn(), emitRecommendedCardShown: vi.fn(),
  emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))
vi.mock('../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: ({ title, subtitle, children, beforeCards }: { title: string; subtitle?: string; children?: React.ReactNode; beforeCards?: React.ReactNode }) => (
    <div data-testid="dashboard-page" data-title={title} data-subtitle={subtitle}>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {beforeCards}
      {children}
    </div>
  ),
}))

vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => ({
    clusters: [], isLoading: false, isRefreshing: false, refetch: vi.fn(), error: null,
  }),
  useGPUNodes: () => ({ nodes: [], isLoading: false, refetch: vi.fn() }),
  useResourceQuotas: () => ({ resourceQuotas: [] }),
  useNamespaces: () => ({ namespaces: [], isLoading: false }),
}))

vi.mock('../../hooks/useGPUReservations', () => ({
  useGPUReservations: () => ({
    reservations: [],
    createReservation: vi.fn(),
    updateReservation: vi.fn(),
    deleteReservation: vi.fn(),
    activateReservation: vi.fn(),
  }),
}))

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [], isAllClustersSelected: true,
    customFilter: '', filterByCluster: (items: unknown[]) => items,
  }),
}))

vi.mock('../../lib/unified/demo', () => ({
  useIsModeSwitching: () => false,
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToAllGPU: vi.fn(),
  }),
}))

vi.mock('../../hooks/useUniversalStats', () => ({
  useUniversalStats: () => ({ getStatValue: () => ({ value: 0 }) }),
  createMergedStatValueGetter: () => () => ({ value: 0 }),
}))

vi.mock('../../hooks/useAIMode', () => ({
  useAIMode: () => ({ isFeatureEnabled: () => true }),
  getAIMode: () => 'basic',
}))

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ user: { login: 'test-user', name: 'Test User' }, isAuthenticated: false }),
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

// Mock useBackendHealth to prevent the singleton from polling /health
vi.mock('../../hooks/useBackendHealth', () => ({
  useBackendHealth: () => ({
    status: 'disconnected',
    isConnected: false,
    lastCheck: null,
    versionChanged: false,
    inCluster: false,
    isInClusterMode: false,
  }),
  isBackendConnected: () => false,
  isInClusterMode: () => false,
}))

// Mock useGPUUtilizations to prevent API calls and interval polling
vi.mock('../../hooks/useGPUUtilizations', () => ({
  useGPUUtilizations: () => ({ utilizations: {}, isLoading: false }),
}))

// Mock useRefreshIndicator to prevent timers
vi.mock('../../hooks/useRefreshIndicator', () => ({
  useRefreshIndicator: () => ({ showIndicator: false, triggerRefresh: vi.fn() }),
}))

// Mock the card registry to avoid loading 50+ lazy card components
vi.mock('../cards/cardRegistry', () => ({
  CARD_COMPONENTS: {} as Record<string, unknown>,
  getDefaultCardWidth: () => 6,
  DEMO_DATA_CARDS: [],
  LIVE_DATA_CARDS: [],
  MODULE_MAP: {},
  CARD_SIZES: {},
  registerDynamicCardType: vi.fn(),
}))

// Mock CardWrapper to avoid loading its heavy dependency tree (timers, effects, portals)
vi.mock('../cards/CardWrapper', () => ({
  CardWrapper: ({ children }: { children?: React.ReactNode }) => <div data-testid="card-wrapper">{children}</div>,
  CARD_TITLES: {} as Record<string, string>,
  CARD_DESCRIPTIONS: {} as Record<string, string>,
}))

// Mock AddCardModal to avoid loading CardFactory + dynamic card infrastructure
vi.mock('../dashboard/AddCardModal', () => ({
  AddCardModal: () => null,
}))

// Mock ReservationFormModal to reduce component tree size
vi.mock('./ReservationFormModal', () => ({
  ReservationFormModal: () => null,
}))

// Mock chart components to avoid heavy rendering libraries
vi.mock('../charts/PieChart', () => ({
  DonutChart: () => <div data-testid="donut-chart" />,
}))
vi.mock('../charts/BarChart', () => ({
  BarChart: () => <div data-testid="bar-chart" />,
}))
vi.mock('../charts/Sparkline', () => ({
  Sparkline: () => <div data-testid="sparkline" />,
}))

// Mock @dnd-kit to avoid drag-and-drop overhead in unit tests
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: () => ({}),
  useSensors: () => [],
}))
vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: (arr: unknown[]) => arr,
  SortableContext: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  rectSortingStrategy: vi.fn(),
  useSortable: () => ({
    attributes: {}, listeners: {}, setNodeRef: vi.fn(),
    transform: null, transition: null, isDragging: false,
  }),
}))
vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))

// Mock localStorage utilities
vi.mock('../../lib/utils/localStorage', () => ({
  safeGetJSON: () => null,
  safeSetJSON: vi.fn(),
}))

// Mock useSnoozedCards (used by CardWrapper, but CardWrapper is mocked above — belt-and-suspenders)
vi.mock('../../hooks/useSnoozedCards', () => ({
  useSnoozedCards: () => ({ snoozedCards: [], snoozeSwap: vi.fn(), unsnooze: vi.fn() }),
}))

import { GPUReservations } from './GPUReservations'

describe('GPUReservations Component', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllTimers()
  })

  const renderGPU = () =>
    render(
      <MemoryRouter>
        <GPUReservations />
      </MemoryRouter>
    )

  it('renders without crashing', () => {
    expect(() => renderGPU()).not.toThrow()
  })

  it('renders the GPU reservations title', () => {
    renderGPU()
    expect(screen.getAllByText(/gpu/i).length).toBeGreaterThan(0)
  })
})
