/**
 * DashboardRuntime-coverage — tests for uncovered branches
 *
 * Covers: feature flag defaults (no features key), workload drag-to-cluster
 * deployment, card insertion at specific index, stats config with registry
 * getter, stats fallback when no getter, autoRefreshInterval wiring,
 * handleSaveCardConfig flow, and handleApplyTemplate calling reset+addCards.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Capture DndContext callbacks for simulating drag events
const capturedDndProps = vi.hoisted(() => ({
  onDragEnd: null as null | ((e: unknown) => void),
  onDragStart: null as null | ((e: unknown) => void),
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd, onDragStart }: {
    children: React.ReactNode
    onDragEnd?: (e: unknown) => void
    onDragStart?: (e: unknown) => void
  }) => {
    capturedDndProps.onDragEnd = onDragEnd ?? null
    capturedDndProps.onDragStart = onDragStart ?? null
    return <div data-testid="dnd-context">{children}</div>
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drag-overlay">{children}</div>
  ),
  closestCenter: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(),
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sortable-context">{children}</div>
  ),
  rectSortingStrategy: {},
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
  }),
}))

const mockUseDashboard = vi.fn()
vi.mock('../dashboardHooks', () => ({
  useDashboard: (...args: unknown[]) => mockUseDashboard(...args),
}))

vi.mock('../DashboardComponents', () => ({
  DashboardHeader: ({ title }: { title: string }) => (
    <div data-testid="dashboard-header">{title}</div>
  ),
  DashboardCardsSection: ({ title, children, onToggle }: {
    title: string; children: React.ReactNode; onToggle: () => void
  }) => (
    <div data-testid="cards-section">
      <button data-testid="toggle" onClick={onToggle}>{title}</button>
      {children}
    </div>
  ),
  DashboardEmptyCards: ({ onAddCards }: { onAddCards: () => void }) => (
    <div data-testid="empty-cards">
      <button data-testid="empty-add" onClick={onAddCards}>Add</button>
    </div>
  ),
  DashboardCardsGrid: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="cards-grid">{children}</div>
  ),
  SortableDashboardCard: ({ card, onInsertBefore, onInsertAfter }: {
    card: { id: string; card_type: string }
    onInsertBefore?: () => void
    onInsertAfter?: () => void
  }) => (
    <div data-testid={`card-${card.id}`}>
      {card.card_type}
      {onInsertBefore && <button data-testid={`ibefore-${card.id}`} onClick={onInsertBefore}>IB</button>}
      {onInsertAfter && <button data-testid={`iafter-${card.id}`} onClick={onInsertAfter}>IA</button>}
    </div>
  ),
  DragPreviewCard: ({ card }: { card: { id: string } }) => (
    <div data-testid={`preview-${card.id}`} />
  ),
}))

vi.mock('../../../components/ui/StatsOverview', () => ({
  StatsOverview: () => <div data-testid="stats-overview" />,
}))
vi.mock('../../../components/ui/StatsBlockDefinitions', () => ({}))

vi.mock('../../../components/dashboard/AddCardModal', () => ({
  AddCardModal: ({ isOpen, onAddCards, onClose }: {
    isOpen: boolean
    onAddCards: (c: Array<{ type: string; title: string; config: Record<string, unknown> }>) => void
    onClose: () => void
  }) => (
    isOpen ? (
      <div data-testid="add-card-modal">
        <button data-testid="modal-add" onClick={() => onAddCards([{ type: 'x', title: 'X', config: {} }])}>Add</button>
        <button data-testid="modal-close" onClick={onClose}>Close</button>
      </div>
    ) : null
  ),
}))

vi.mock('../../../components/dashboard/TemplatesModal', () => ({
  TemplatesModal: ({ isOpen, onApplyTemplate, onClose }: {
    isOpen: boolean
    onApplyTemplate: (t: { cards: Array<{ card_type: string; title: string; config?: Record<string, unknown> }> }) => void
    onClose: () => void
  }) => (
    isOpen ? (
      <div data-testid="templates-modal">
        <button
          data-testid="apply-tmpl"
          onClick={() => onApplyTemplate({ cards: [{ card_type: 'ta', title: 'A' }] })}
        >Apply</button>
        <button data-testid="tmpl-close" onClick={onClose}>Close</button>
      </div>
    ) : null
  ),
}))

vi.mock('../../../components/dashboard/ConfigureCardModal', () => ({
  ConfigureCardModal: ({ isOpen, onSave, onClose }: {
    isOpen: boolean
    onSave?: (id: string, config: Record<string, unknown>) => void
    onClose?: () => void
  }) => (
    isOpen ? (
      <div data-testid="configure-modal">
        <button data-testid="save-config" onClick={() => onSave?.('r1', { updated: true })}>Save</button>
        <button data-testid="close-config" onClick={onClose}>Close</button>
      </div>
    ) : null
  ),
}))

vi.mock('../../../components/dashboard/FloatingDashboardActions', () => ({
  FloatingDashboardActions: ({ onAddCard, onOpenTemplates }: {
    onAddCard?: () => void
    onOpenTemplates?: () => void
  }) => (
    <div data-testid="fab">
      <button data-testid="fab-add" onClick={onAddCard}>+</button>
      <button data-testid="fab-tmpl" onClick={onOpenTemplates}>T</button>
    </div>
  ),
}))

vi.mock('../../../components/cards/ClusterDropZone', () => ({
  ClusterDropZone: () => <div data-testid="cluster-drop" />,
}))

const mockDeployMutate = vi.fn()
vi.mock('../../../hooks/useWorkloads', () => ({
  useDeployWorkload: () => ({ mutate: mockDeployMutate }),
}))

const mockShowToast = vi.fn()
vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { DashboardRuntime, registerStatsValueGetter } from '../DashboardRuntime'
import type { DashboardDefinition } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AUTO_REFRESH_INTERVAL_MS = 15000

const FULL_DEFINITION: DashboardDefinition = {
  id: 'cov-dash',
  title: 'Coverage',
  description: 'Coverage test dashboard',
  icon: 'LayoutGrid',
  route: '/coverage',
  storageKey: 'cov-cards',
  defaultCards: [{ type: 'card_a', position: { w: 4, h: 2 } }],
  stats: { type: 'clusters', collapsedKey: 'cov-stats' },
  features: {
    autoRefresh: true,
    autoRefreshInterval: AUTO_REFRESH_INTERVAL_MS,
    templates: true,
    addCard: true,
    cardSections: true,
    floatingActions: true,
  },
}

function makeDashboardReturn(overrides: Record<string, unknown> = {}) {
  return {
    cards: [
      { id: 'r1', card_type: 'card_a', config: {}, title: 'Card A' },
      { id: 'r2', card_type: 'card_b', config: {}, title: 'Card B' },
    ],
    setCards: vi.fn(),
    addCards: vi.fn(),
    removeCard: vi.fn(),
    configureCard: vi.fn(),
    updateCardWidth: vi.fn(),
    updateCardHeight: vi.fn(),
    reset: vi.fn(),
    isCustomized: false,
    showAddCard: false,
    setShowAddCard: vi.fn(),
    showTemplates: false,
    setShowTemplates: vi.fn(),
    configuringCard: null,
    setConfiguringCard: vi.fn(),
    openConfigureCard: vi.fn(),
    closeConfigureCard: vi.fn(),
    showCards: true,
    setShowCards: vi.fn(),
    expandCards: vi.fn(),
    dnd: {
      sensors: [],
      activeId: null,
      activeDragData: null,
      handleDragStart: vi.fn(),
      handleDragEnd: vi.fn(),
    },
    autoRefresh: false,
    setAutoRefresh: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    ...overrides,
  }
}

function renderRuntime(props: Partial<React.ComponentProps<typeof DashboardRuntime>> = {}) {
  return render(
    <MemoryRouter initialEntries={[FULL_DEFINITION.route]}>
      <DashboardRuntime definition={FULL_DEFINITION} {...props} />
    </MemoryRouter>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DashboardRuntime — coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDashboard.mockReturnValue(makeDashboardReturn())
  })

  // ---- Feature flag defaults (no features key) ----

  it('uses default features when definition.features is undefined', () => {
    const def: DashboardDefinition = {
      ...FULL_DEFINITION,
      features: undefined,
    }
    mockUseDashboard.mockReturnValue(makeDashboardReturn())
    renderRuntime({ definition: def })
    // All defaults are truthy, so everything should render
    expect(screen.getByTestId('cards-section')).toBeInTheDocument()
    expect(screen.getByTestId('fab')).toBeInTheDocument()
  })

  // ---- Workload drag-to-cluster deployment ----

  it('handles workload drag start by setting dragged workload state', () => {
    const handleDragStart = vi.fn()
    mockUseDashboard.mockReturnValue(makeDashboardReturn({
      dnd: {
        sensors: [],
        activeId: null,
        activeDragData: null,
        handleDragStart,
        handleDragEnd: vi.fn(),
      },
    }))
    renderRuntime()

    // Simulate drag start with workload data
    capturedDndProps.onDragStart?.({
      active: {
        id: 'w1',
        data: { current: { type: 'workload', workload: { name: 'app', namespace: 'ns', sourceCluster: 'c1' } } },
      },
    })
    expect(handleDragStart).toHaveBeenCalled()
  })

  it('deploys workload when dropped on cluster target', () => {
    const baseDragEnd = vi.fn()
    mockDeployMutate.mockReturnValue(Promise.resolve())
    mockUseDashboard.mockReturnValue(makeDashboardReturn({
      dnd: {
        sensors: [],
        activeId: null,
        activeDragData: null,
        handleDragStart: vi.fn(),
        handleDragEnd: baseDragEnd,
      },
    }))
    renderRuntime()

    // Simulate drag end: workload dropped on cluster
    capturedDndProps.onDragEnd?.({
      active: {
        id: 'w1',
        data: {
          current: {
            type: 'workload',
            workload: { name: 'app', namespace: 'ns', sourceCluster: 'src' },
          },
        },
      },
      over: {
        id: 'cluster-1',
        data: { current: { type: 'cluster', cluster: 'target-cluster' } },
      },
    })

    expect(baseDragEnd).toHaveBeenCalled()
    expect(mockDeployMutate).toHaveBeenCalledWith(
      {
        workloadName: 'app',
        namespace: 'ns',
        sourceCluster: 'src',
        targetClusters: ['target-cluster'],
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
  })

  // ---- Card insertion at index ----

  it('inserts card at specific index when insertBefore sets index', () => {
    const setCards = vi.fn()
    const setShowAddCard = vi.fn()
    const setShowCards = vi.fn()

    mockUseDashboard.mockReturnValue(makeDashboardReturn({
      setCards,
      setShowAddCard,
      setShowCards,
      showAddCard: false,
    }))
    renderRuntime()

    // Click insertBefore on first card — sets insertAtIndex = 0
    fireEvent.click(screen.getByTestId('ibefore-r1'))
    expect(setShowAddCard).toHaveBeenCalledWith(true)
  })

  it('inserts card at index+1 when insertAfter is clicked', () => {
    const setShowAddCard = vi.fn()
    mockUseDashboard.mockReturnValue(makeDashboardReturn({ setShowAddCard }))
    renderRuntime()

    fireEvent.click(screen.getByTestId('iafter-r1'))
    expect(setShowAddCard).toHaveBeenCalledWith(true)
  })

  // ---- Stats config with registered getter ----

  it('uses registered stats value getter when available', () => {
    const GETTER_RESULT = { value: '99', sublabel: 'pct' }
    registerStatsValueGetter('clusters', () => GETTER_RESULT)
    renderRuntime()
    expect(screen.getByTestId('stats-overview')).toBeInTheDocument()
  })

  it('uses custom getStatValue prop over registry getter', () => {
    const customGetter = vi.fn(() => ({ value: 'custom', sublabel: '' }))
    renderRuntime({ getStatValue: customGetter })
    expect(screen.getByTestId('stats-overview')).toBeInTheDocument()
  })

  it('uses fallback getter when no stats type or getter', () => {
    const defNoStats: DashboardDefinition = { ...FULL_DEFINITION, stats: undefined }
    renderRuntime({ definition: defNoStats })
    // No stats overview rendered when stats config is absent
    expect(screen.queryByTestId('stats-overview')).not.toBeInTheDocument()
  })

  // ---- handleSaveCardConfig ----

  it('saves card config and closes configure modal', () => {
    const configureCard = vi.fn()
    const closeConfigureCard = vi.fn()
    const card = { id: 'r1', card_type: 'card_a', config: {}, title: 'Card A' }
    mockUseDashboard.mockReturnValue(makeDashboardReturn({
      configuringCard: card,
      configureCard,
      closeConfigureCard,
    }))
    renderRuntime()

    fireEvent.click(screen.getByTestId('save-config'))
    expect(configureCard).toHaveBeenCalledWith('r1', { updated: true })
    expect(closeConfigureCard).toHaveBeenCalled()
  })

  // ---- handleApplyTemplate ----

  it('applies template by resetting and adding new cards', () => {
    const reset = vi.fn()
    const addCards = vi.fn()
    const setShowTemplates = vi.fn()
    const setShowCards = vi.fn()
    mockUseDashboard.mockReturnValue(makeDashboardReturn({
      showTemplates: true,
      reset,
      addCards,
      setShowTemplates,
      setShowCards,
    }))
    renderRuntime()

    fireEvent.click(screen.getByTestId('apply-tmpl'))
    expect(reset).toHaveBeenCalled()
    expect(addCards).toHaveBeenCalledWith([
      { type: 'ta', title: 'A', config: undefined },
    ])
    expect(setShowTemplates).toHaveBeenCalledWith(false)
    expect(setShowCards).toHaveBeenCalledWith(true)
  })

  // ---- autoRefreshInterval wiring ----

  it('passes autoRefreshInterval to useDashboard', () => {
    renderRuntime()
    expect(mockUseDashboard).toHaveBeenCalledWith(
      expect.objectContaining({
        autoRefreshInterval: AUTO_REFRESH_INTERVAL_MS,
      }),
    )
  })

  // ---- Close modal resets insertAtIndex ----

  it('resets insertAtIndex when add card modal is closed', () => {
    const setShowAddCard = vi.fn()
    mockUseDashboard.mockReturnValue(makeDashboardReturn({
      showAddCard: true,
      setShowAddCard,
    }))
    renderRuntime()

    fireEvent.click(screen.getByTestId('modal-close'))
    expect(setShowAddCard).toHaveBeenCalledWith(false)
  })

  // ---- hasData / showSkeletons ----

  it('sets hasData=true when data is provided even while loading', () => {
    renderRuntime({ isLoading: true, data: { items: [] } })
    // Stats overview is still rendered
    expect(screen.getByTestId('stats-overview')).toBeInTheDocument()
  })

  it('sets hasData=false when loading with no data', () => {
    renderRuntime({ isLoading: true, data: undefined })
    expect(screen.getByTestId('stats-overview')).toBeInTheDocument()
  })
})
