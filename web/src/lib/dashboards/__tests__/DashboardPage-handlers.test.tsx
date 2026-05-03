/**
 * DashboardPage-handlers — tests for card handler callbacks not covered elsewhere.
 *
 * Covers: handleRemoveCard, handleConfigureCard, handleWidthChange,
 * handleHeightChange, handleSaveCardConfig (ConfigureCardModal save path).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — declared before component import
// ---------------------------------------------------------------------------

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useLocation: () => ({ pathname: '/handlers-test' }),
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dnd-context">{children}</div>
  ),
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
    <div>{children}</div>
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

// ---------------------------------------------------------------------------
// SortableDashboardCard mock — exposes ALL card callback buttons
// ---------------------------------------------------------------------------
vi.mock('../DashboardComponents', () => ({
  SortableDashboardCard: ({
    card,
    onConfigure,
    onRemove,
    onWidthChange,
    onHeightChange,
  }: {
    card: { id: string; card_type: string }
    onConfigure?: () => void
    onRemove?: () => void
    onWidthChange?: (w: number) => void
    onHeightChange?: (h: number) => void
  }) => (
    <div data-testid={`sortable-card-${card.id}`}>
      {onConfigure && (
        <button data-testid={`configure-${card.id}`} onClick={onConfigure}>
          Configure
        </button>
      )}
      {onRemove && (
        <button data-testid={`remove-${card.id}`} onClick={onRemove}>
          Remove
        </button>
      )}
      {onWidthChange && (
        <button
          data-testid={`width-${card.id}`}
          onClick={() => onWidthChange(8)}
        >
          Width
        </button>
      )}
      {onHeightChange && (
        <button
          data-testid={`height-${card.id}`}
          onClick={() => onHeightChange(3)}
        >
          Height
        </button>
      )}
    </div>
  ),
  DragPreviewCard: ({ card }: { card: { id: string } }) => (
    <div data-testid={`drag-preview-${card.id}`} />
  ),
}))

// ---------------------------------------------------------------------------
// ConfigureCardModal mock — exposes a save button
// ---------------------------------------------------------------------------
vi.mock('../../../components/dashboard/ConfigureCardModal', () => ({
  ConfigureCardModal: ({
    isOpen,
    onSave,
  }: {
    isOpen: boolean
    onSave?: (id: string, cfg: Record<string, unknown>) => void
    card?: { id: string }
  }) =>
    isOpen ? (
      <div data-testid="configure-card-modal">
        <button
          data-testid="modal-save"
          onClick={() => onSave?.('c1', { key: 'value' })}
        >
          Save
        </button>
      </div>
    ) : null,
}))

vi.mock('../../../components/dashboard/FloatingDashboardActions', () => ({
  FloatingDashboardActions: () => <div data-testid="floating-actions" />,
}))

vi.mock('../../../components/dashboard/customizer/DashboardCustomizer', () => ({
  DashboardCustomizer: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="dashboard-customizer" /> : null,
}))

vi.mock('../../../components/dashboard/templates', () => ({}))

vi.mock('../../../components/ui/StatsOverview', () => ({
  StatsOverview: () => <div data-testid="stats-overview" />,
}))

vi.mock('../../../components/ui/StatsBlockDefinitions', () => ({}))

vi.mock('../../../components/shared/DashboardHeader', () => ({
  DashboardHeader: ({ title }: { title: string }) => (
    <div data-testid="dashboard-header">{title}</div>
  ),
}))

vi.mock('../../../components/dashboard/DashboardHealthIndicator', () => ({
  DashboardHealthIndicator: () => <div data-testid="health-indicator" />,
}))

vi.mock('../../../hooks/useUniversalStats', () => ({
  useUniversalStats: () => ({
    getStatValue: (_id: string) => ({ value: '-', sublabel: '' }),
  }),
  createMergedStatValueGetter:
    (a: (id: string) => unknown, b: (id: string) => unknown) =>
    (id: string) =>
      a(id) ?? b(id),
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
  getIcon: () => (_props: { className?: string }) => (
    <span data-testid="icon" />
  ),
}))

vi.mock('../../../hooks/useDashboardContext', () => ({
  useDashboardContextOptional: () => null,
}))

// ---------------------------------------------------------------------------
// Dashboard hooks mock
// ---------------------------------------------------------------------------
const mockUseDashboard = vi.fn()
vi.mock('../dashboardHooks', () => ({
  useDashboard: (...args: unknown[]) => mockUseDashboard(...args),
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

function makeDashboard(overrides: Record<string, unknown> = {}) {
  return {
    cards: [{ id: 'c1', card_type: 'card_a', config: {}, title: 'Card A' }],
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

function renderPage(overrides: Record<string, unknown> = {}) {
  mockUseDashboard.mockReturnValue(makeDashboard(overrides))
  return render(
    <DashboardPage
      title="Handlers Test"
      icon="LayoutGrid"
      storageKey="handlers-storage"
      defaultCards={DEFAULT_CARDS}
      statsType={'clusters' as never}
    />,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('DashboardPage — card handler callbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handleRemoveCard calls removeCard with the card id', () => {
    const removeCard = vi.fn()
    renderPage({ removeCard })
    fireEvent.click(screen.getByTestId('remove-c1'))
    expect(removeCard).toHaveBeenCalledWith('c1')
  })

  it('handleConfigureCard calls openConfigureCard with the card id', () => {
    const openConfigureCard = vi.fn()
    renderPage({ openConfigureCard })
    fireEvent.click(screen.getByTestId('configure-c1'))
    expect(openConfigureCard).toHaveBeenCalledWith('c1')
  })

  it('handleWidthChange calls updateCardWidth with card id and new width', () => {
    const updateCardWidth = vi.fn()
    renderPage({ updateCardWidth })
    fireEvent.click(screen.getByTestId('width-c1'))
    expect(updateCardWidth).toHaveBeenCalledWith('c1', 8)
  })

  it('handleHeightChange calls updateCardHeight with card id and new height', () => {
    const updateCardHeight = vi.fn()
    renderPage({ updateCardHeight })
    fireEvent.click(screen.getByTestId('height-c1'))
    expect(updateCardHeight).toHaveBeenCalledWith('c1', 3)
  })

  it('handleSaveCardConfig calls configureCard and closes modal', () => {
    const configureCard = vi.fn()
    const setConfiguringCard = vi.fn()
    mockUseDashboard.mockReturnValue(
      makeDashboard({
        configuringCard: { id: 'c1', card_type: 'card_a', config: {}, title: 'Card A' },
        configureCard,
        setConfiguringCard,
      }),
    )
    render(
      <DashboardPage
        title="Save Test"
        icon="LayoutGrid"
        storageKey="save-storage"
        defaultCards={DEFAULT_CARDS}
        statsType={'clusters' as never}
      />,
    )
    fireEvent.click(screen.getByTestId('modal-save'))
    expect(configureCard).toHaveBeenCalledWith('c1', { key: 'value' })
    expect(setConfiguringCard).toHaveBeenCalledWith(null)
  })
})
