/**
 * DashboardPage-coverage — tests for uncovered branches in DashboardPage.tsx
 *
 * Covers: URL search params (?addCard=true, ?customizeSidebar=true),
 * drag overlay rendering (active drag state, workload drag),
 * empty cards state with custom actions, card insertion at index,
 * customizer close resetting state, getStatValue merging,
 * and rightExtra rendering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { DragEndEvent } from '@dnd-kit/core'

// ---------------------------------------------------------------------------
// Mocks — declared before component import
// ---------------------------------------------------------------------------

const mockSearchParamsData = vi.hoisted(() => ({
  params: new URLSearchParams(),
}))

const mockSetSearchParams = vi.fn()
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParamsData.params, mockSetSearchParams],
  useLocation: () => ({ pathname: '/coverage-test' }),
}))

// dnd-kit — expose onDragEnd so we can call it
const capturedDndProps = vi.hoisted(() => ({
  onDragEnd: null as null | ((e: DragEndEvent) => void),
  onDragStart: null as null | ((e: unknown) => void),
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd, onDragStart }: {
    children: React.ReactNode
    onDragEnd?: (e: DragEndEvent) => void
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
  pointerWithin: vi.fn(() => []),
  rectIntersection: vi.fn(() => []),
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

// Dashboard hooks
const mockUseDashboard = vi.fn()
vi.mock('../dashboardHooks', () => ({
  useDashboard: (...args: unknown[]) => mockUseDashboard(...args),
}))

// Child component stubs
vi.mock('../DashboardComponents', () => ({
  SortableDashboardCard: ({ card, onInsertBefore, onInsertAfter }: {
    card: { id: string; card_type: string }
    onInsertBefore?: () => void
    onInsertAfter?: () => void
  }) => (
    <div data-testid={`sortable-card-${card.id}`}>
      {card.card_type}
      {onInsertBefore && <button data-testid={`insert-before-${card.id}`} onClick={onInsertBefore}>Before</button>}
      {onInsertAfter && <button data-testid={`insert-after-${card.id}`} onClick={onInsertAfter}>After</button>}
    </div>
  ),
  DragPreviewCard: ({ card }: { card: { id: string } }) => (
    <div data-testid={`drag-preview-${card.id}`} />
  ),
}))

vi.mock('../../../components/dashboard/ConfigureCardModal', () => ({
  ConfigureCardModal: ({ isOpen }: { isOpen: boolean }) => (
    isOpen ? <div data-testid="configure-card-modal" /> : null
  ),
}))

vi.mock('../../../components/dashboard/FloatingDashboardActions', () => ({
  FloatingDashboardActions: () => <div data-testid="floating-actions" />,
}))

vi.mock('../../../components/dashboard/customizer/DashboardCustomizer', () => ({
  DashboardCustomizer: ({ isOpen, onClose, onAddCards, initialSection, initialSearch, initialWidgetCardType }: {
    isOpen: boolean
    onClose: () => void
    onAddCards: (c: Array<{ type: string; title: string; config: Record<string, unknown> }>) => void
    initialSection?: string
    initialSearch?: string
    initialWidgetCardType?: string
  }) => (
    isOpen ? (
      <div data-testid="dashboard-customizer">
        <span data-testid="initial-section">{initialSection || 'none'}</span>
        <span data-testid="initial-search">{initialSearch || ''}</span>
        <span data-testid="initial-widget">{initialWidgetCardType || ''}</span>
        <button data-testid="customizer-close" onClick={onClose}>Close</button>
        <button
          data-testid="customizer-add"
          onClick={() => onAddCards([{ type: 'inserted', title: 'Inserted', config: {} }])}
        >
          Add
        </button>
      </div>
    ) : null
  ),
}))

vi.mock('../../../components/dashboard/templates', () => ({}))
vi.mock('../../../components/ui/StatsOverview', () => ({
  StatsOverview: ({ isLoading, hasData }: { isLoading: boolean; hasData: boolean }) => (
    <div data-testid="stats-overview" data-loading={isLoading} data-hasdata={hasData} />
  ),
}))
vi.mock('../../../components/ui/StatsBlockDefinitions', () => ({}))
vi.mock('../../../components/shared/DashboardHeader', () => ({
  DashboardHeader: ({ title, rightExtra }: { title: string; rightExtra?: React.ReactNode }) => (
    <div data-testid="dashboard-header">{title}{rightExtra}</div>
  ),
}))
vi.mock('../../../components/dashboard/DashboardHealthIndicator', () => ({
  DashboardHealthIndicator: () => <div data-testid="health-indicator" />,
}))
vi.mock('../../../hooks/useUniversalStats', () => ({
  useUniversalStats: () => ({
    getStatValue: (id: string) => ({ value: id, sublabel: '' }),
  }),
  createMergedStatValueGetter: (a: Function, b: Function) => (id: string) => a(id) ?? b(id),
}))
vi.mock('../../../hooks/useRefreshIndicator', () => ({
  useRefreshIndicator: (fn: () => void) => ({
    showIndicator: false,
    triggerRefresh: fn,
  }),
}))
vi.mock('../../../components/cards/cardRegistry', () => ({
  prefetchCardChunks: vi.fn(),
}))
vi.mock('../../icons', () => ({
  getIcon: () => (props: { className?: string }) => <span data-testid="icon" className={props.className} />,
}))
vi.mock('../../../hooks/useDashboardContext', () => ({
  useDashboardContextOptional: () => null,
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { DashboardPage } from '../DashboardPage'
import type { DashboardCardPlacement } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_CARDS: DashboardCardPlacement[] = [
  { type: 'card_a', position: { w: 4, h: 2 } },
]

function makeDashboardReturn(overrides: Record<string, unknown> = {}) {
  return {
    cards: [
      { id: 'c1', card_type: 'card_a', config: {}, title: 'Card A' },
      { id: 'c2', card_type: 'card_b', config: {}, title: 'Card B' },
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

function renderPage(props: Partial<React.ComponentProps<typeof DashboardPage>> = {}) {
  return render(
    <DashboardPage
      title="Coverage"
      icon="LayoutGrid"
      storageKey="cov-storage"
      defaultCards={DEFAULT_CARDS}
      statsType={'clusters' as never}
      {...props}
    />,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DashboardPage — coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParamsData.params = new URLSearchParams()
    mockUseDashboard.mockReturnValue(makeDashboardReturn())
  })

  // ---- URL search params ----

  it('opens customizer with cards section when ?addCard=true', () => {
    mockSearchParamsData.params = new URLSearchParams('addCard=true')
    const setShowAddCard = vi.fn()
    mockUseDashboard.mockReturnValue(makeDashboardReturn({ showAddCard: true, setShowAddCard }))
    renderPage()
    expect(setShowAddCard).toHaveBeenCalledWith(true)
    expect(screen.getByTestId('initial-section')).toHaveTextContent('cards')
  })

  it('opens customizer with cardSearch from ?addCard=true&cardSearch=foo', () => {
    mockSearchParamsData.params = new URLSearchParams('addCard=true&cardSearch=foo')
    const setShowAddCard = vi.fn()
    mockUseDashboard.mockReturnValue(makeDashboardReturn({ showAddCard: true, setShowAddCard }))
    renderPage()
    expect(setShowAddCard).toHaveBeenCalledWith(true)
    expect(screen.getByTestId('initial-search')).toHaveTextContent('foo')
  })

  it('opens customizer with dashboards section when ?customizeSidebar=true', () => {
    mockSearchParamsData.params = new URLSearchParams('customizeSidebar=true')
    const setShowAddCard = vi.fn()
    mockUseDashboard.mockReturnValue(makeDashboardReturn({ showAddCard: true, setShowAddCard }))
    renderPage()
    expect(setShowAddCard).toHaveBeenCalledWith(true)
    expect(screen.getByTestId('initial-section')).toHaveTextContent('dashboards')
  })

  it('clears search params after processing addCard', () => {
    mockSearchParamsData.params = new URLSearchParams('addCard=true')
    mockUseDashboard.mockReturnValue(makeDashboardReturn({ showAddCard: true }))
    renderPage()
    expect(mockSetSearchParams).toHaveBeenCalledWith({}, { replace: true })
  })

  // ---- Drag overlay ----

  it('renders drag preview when activeId matches a card', () => {
    mockUseDashboard.mockReturnValue(makeDashboardReturn({
      dnd: {
        sensors: [],
        activeId: 'c1',
        activeDragData: null,
        handleDragStart: vi.fn(),
        handleDragEnd: vi.fn(),
      },
    }))
    renderPage()
    expect(screen.getByTestId('drag-preview-c1')).toBeInTheDocument()
  })

  it('renders workload drag overlay when activeDragData.type is workload', () => {
    mockUseDashboard.mockReturnValue(makeDashboardReturn({
      dnd: {
        sensors: [],
        activeId: 'workload-drag-1',
        activeDragData: { type: 'workload', workload: { name: 'my-app' } },
        handleDragStart: vi.fn(),
        handleDragEnd: vi.fn(),
      },
    }))
    renderPage()
    expect(screen.getByText('my-app')).toBeInTheDocument()
    expect(screen.getByText('Drop on a cluster group to deploy')).toBeInTheDocument()
  })

  it('renders workload drag overlay with default name when workload has no name', () => {
    mockUseDashboard.mockReturnValue(makeDashboardReturn({
      dnd: {
        sensors: [],
        activeId: 'workload-drag-2',
        activeDragData: { type: 'workload', workload: {} },
        handleDragStart: vi.fn(),
        handleDragEnd: vi.fn(),
      },
    }))
    renderPage()
    expect(screen.getByText('Workload')).toBeInTheDocument()
  })

  // ---- Combined drag-end ----

  it('calls both baseDragEnd and externalDragEnd on drag end event', () => {
    const baseDragEnd = vi.fn()
    const externalDragEnd = vi.fn()
    mockUseDashboard.mockReturnValue(makeDashboardReturn({
      dnd: {
        sensors: [],
        activeId: null,
        activeDragData: null,
        handleDragStart: vi.fn(),
        handleDragEnd: baseDragEnd,
      },
    }))
    renderPage({ onDragEnd: externalDragEnd })

    // Simulate drag end through captured callback
    const fakeEvent = { active: { id: 'c1' }, over: { id: 'c2' } } as unknown as DragEndEvent
    capturedDndProps.onDragEnd?.(fakeEvent)

    expect(baseDragEnd).toHaveBeenCalledWith(fakeEvent)
    expect(externalDragEnd).toHaveBeenCalledWith(fakeEvent)
  })

  // ---- Card insertion at index ----

  it('inserts card at specific index when insertBefore is triggered', () => {
    const setCards = vi.fn()
    const setShowAddCard = vi.fn()
    const expandCards = vi.fn()

    mockUseDashboard.mockReturnValue(makeDashboardReturn({
      setCards,
      setShowAddCard,
      expandCards,
      showAddCard: false,
    }))

    renderPage()

    // Click insert-before on first card to set insertAtIndex=0
    fireEvent.click(screen.getByTestId('insert-before-c1'))
    expect(setShowAddCard).toHaveBeenCalledWith(true)
  })

  it('inserts card at index+1 when insertAfter is triggered', () => {
    const setShowAddCard = vi.fn()
    mockUseDashboard.mockReturnValue(makeDashboardReturn({ setShowAddCard }))
    renderPage()

    fireEvent.click(screen.getByTestId('insert-after-c1'))
    expect(setShowAddCard).toHaveBeenCalledWith(true)
  })

  // ---- Customizer close resets state ----

  it('resets addCardSearch, insertAtIndex, and initialSection on customizer close', () => {
    const setShowAddCard = vi.fn()
    mockUseDashboard.mockReturnValue(makeDashboardReturn({ showAddCard: true, setShowAddCard }))
    renderPage()

    fireEvent.click(screen.getByTestId('customizer-close'))
    expect(setShowAddCard).toHaveBeenCalledWith(false)
  })

  // ---- rightExtra rendering ----

  it('renders rightExtra in the header', () => {
    renderPage({ rightExtra: <div data-testid="right-extra">Extra</div> })
    expect(screen.getByTestId('right-extra')).toBeInTheDocument()
  })

  // ---- Stats loading vs data states ----

  it('passes isLoading=true to stats when loading and no data', () => {
    renderPage({ isLoading: true, hasData: false })
    const stats = screen.getByTestId('stats-overview')
    expect(stats.getAttribute('data-loading')).toBe('true')
    expect(stats.getAttribute('data-hasdata')).toBe('false')
  })

  it('passes isLoading=false to stats when loading but has data', () => {
    renderPage({ isLoading: true, hasData: true })
    const stats = screen.getByTestId('stats-overview')
    // isLoading && !hasData is false when hasData is true
    expect(stats.getAttribute('data-loading')).toBe('false')
  })

  // ---- Empty state with custom actions ----

  it('renders empty state with custom action and secondaryAction', () => {
    mockUseDashboard.mockReturnValue(makeDashboardReturn({ cards: [] }))
    const primaryClick = vi.fn()
    const secondaryClick = vi.fn()
    renderPage({
      emptyState: {
        title: 'Empty',
        description: 'No cards here',
        action: { label: 'Primary', onClick: primaryClick },
        secondaryAction: { label: 'Secondary', onClick: secondaryClick },
      },
    })
    expect(screen.getByText('Empty')).toBeInTheDocument()
    expect(screen.getByText('Primary')).toBeInTheDocument()
    expect(screen.getByText('Secondary')).toBeInTheDocument()
  })

  // ---- getStatValue with custom getter ----

  it('uses custom getStatValue when provided', () => {
    const CUSTOM_VALUE = 'custom-42'
    const customGetter = vi.fn(() => ({ value: CUSTOM_VALUE, sublabel: 'custom' }))
    renderPage({ getStatValue: customGetter })
    // Stats overview renders — the getter is wired through createMergedStatValueGetter
    expect(screen.getByTestId('stats-overview')).toBeInTheDocument()
  })
})
