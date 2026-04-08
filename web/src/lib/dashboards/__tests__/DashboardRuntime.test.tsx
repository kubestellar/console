import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — declared before component import
// ---------------------------------------------------------------------------

// dnd-kit
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dnd-context">{children}</div>
  ),
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

// Dashboard hooks
const mockUseDashboard = vi.fn()
vi.mock('../dashboardHooks', () => ({
  useDashboard: (...args: unknown[]) => mockUseDashboard(...args),
}))

// DashboardComponents stubs
vi.mock('../DashboardComponents', () => ({
  DashboardHeader: ({ title }: { title: string }) => (
    <div data-testid="dashboard-header">{title}</div>
  ),
  DashboardCardsSection: ({ title, children, onToggle }: {
    title: string; children: React.ReactNode; onToggle: () => void
  }) => (
    <div data-testid="cards-section">
      <button data-testid="cards-section-toggle" onClick={onToggle}>{title}</button>
      {children}
    </div>
  ),
  DashboardEmptyCards: ({ onAddCards }: { onAddCards: () => void }) => (
    <div data-testid="empty-cards">
      <button data-testid="empty-add-cards" onClick={onAddCards}>Add Cards</button>
    </div>
  ),
  DashboardCardsGrid: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="cards-grid">{children}</div>
  ),
  SortableDashboardCard: ({ card }: { card: { id: string; card_type: string } }) => (
    <div data-testid={`sortable-card-${card.id}`}>{card.card_type}</div>
  ),
  DragPreviewCard: ({ card }: { card: { id: string } }) => (
    <div data-testid={`drag-preview-${card.id}`} />
  ),
}))

// UI components
vi.mock('../../../components/ui/StatsOverview', () => ({
  StatsOverview: () => <div data-testid="stats-overview" />,
}))

vi.mock('../../../components/ui/StatsBlockDefinitions', () => ({}))

vi.mock('../../../components/dashboard/AddCardModal', () => ({
  AddCardModal: ({ isOpen, onAddCards, onClose }: {
    isOpen: boolean;
    onAddCards: (c: Array<{ type: string; title: string; config: Record<string, unknown> }>) => void;
    onClose: () => void;
  }) => (
    isOpen ? (
      <div data-testid="add-card-modal">
        <button data-testid="modal-add-card" onClick={() => onAddCards([{ type: 'new_card', title: 'New', config: {} }])}>Add</button>
        <button data-testid="modal-close" onClick={onClose}>Close</button>
      </div>
    ) : null
  ),
}))

vi.mock('../../../components/dashboard/TemplatesModal', () => ({
  TemplatesModal: ({ isOpen, onApplyTemplate, onClose }: {
    isOpen: boolean;
    onApplyTemplate: (t: { cards: Array<{ card_type: string; title: string; config?: Record<string, unknown> }> }) => void;
    onClose: () => void;
  }) => (
    isOpen ? (
      <div data-testid="templates-modal">
        <button
          data-testid="apply-template"
          onClick={() => onApplyTemplate({
            cards: [
              { card_type: 'tmpl_x', title: 'X' },
              { card_type: 'tmpl_y', title: 'Y' },
            ],
          })}
        >
          Apply
        </button>
        <button data-testid="templates-close" onClick={onClose}>Close</button>
      </div>
    ) : null
  ),
}))

vi.mock('../../../components/dashboard/ConfigureCardModal', () => ({
  ConfigureCardModal: ({ isOpen }: { isOpen: boolean }) => (
    isOpen ? <div data-testid="configure-card-modal" /> : null
  ),
}))

vi.mock('../../../components/dashboard/FloatingDashboardActions', () => ({
  FloatingDashboardActions: ({ onAddCard, onOpenTemplates, onResetToDefaults }: {
    onAddCard?: () => void; onOpenTemplates?: () => void; onResetToDefaults?: () => void;
  }) => (
    <div data-testid="floating-actions">
      <button data-testid="fab-add" onClick={onAddCard}>+</button>
      <button data-testid="fab-templates" onClick={onOpenTemplates}>T</button>
      <button data-testid="fab-reset" onClick={onResetToDefaults}>R</button>
    </div>
  ),
}))

vi.mock('../../../components/cards/ClusterDropZone', () => ({
  ClusterDropZone: () => <div data-testid="cluster-drop-zone" />,
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

import {
  DashboardRuntime,
  registerDashboard,
  getDashboardDefinition,
  getAllDashboardDefinitions,
  registerStatsValueGetter,
  parseDashboardYAML,
} from '../DashboardRuntime'
import type { DashboardDefinition } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MINIMAL_DEFINITION: DashboardDefinition = {
  id: 'test-dash',
  title: 'Test Runtime',
  description: 'A test dashboard',
  icon: 'LayoutGrid',
  route: '/test',
  storageKey: 'test-runtime-cards',
  defaultCards: [
    { type: 'card_a', position: { w: 4, h: 2 } },
  ],
  stats: {
    type: 'clusters',
    collapsedKey: 'test-stats-collapsed',
  },
  features: {
    autoRefresh: true,
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
    ],
    setCards: vi.fn(),
    addCards: vi.fn(),
    removeCard: vi.fn(),
    configureCard: vi.fn(),
    updateCardWidth: vi.fn(),
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

function renderRuntime(
  props: Partial<React.ComponentProps<typeof DashboardRuntime>> = {},
) {
  return render(
    <DashboardRuntime
      definition={MINIMAL_DEFINITION}
      {...props}
    />,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DashboardRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDashboard.mockReturnValue(makeDashboardReturn())
  })

  // ---- Basic rendering ----

  it('renders the header with definition title', () => {
    renderRuntime()
    expect(screen.getByTestId('dashboard-header')).toHaveTextContent('Test Runtime')
  })

  it('renders stats overview when stats config is present', () => {
    renderRuntime()
    expect(screen.getByTestId('stats-overview')).toBeInTheDocument()
  })

  it('does not render stats overview when stats config is absent', () => {
    const defWithoutStats = { ...MINIMAL_DEFINITION, stats: undefined }
    renderRuntime({ definition: defWithoutStats })
    expect(screen.queryByTestId('stats-overview')).not.toBeInTheDocument()
  })

  it('renders sortable cards', () => {
    renderRuntime()
    expect(screen.getByTestId('sortable-card-r1')).toBeInTheDocument()
  })

  it('renders empty state when no cards', () => {
    mockUseDashboard.mockReturnValue(makeDashboardReturn({ cards: [] }))
    renderRuntime()
    expect(screen.getByTestId('empty-cards')).toBeInTheDocument()
  })

  it('renders children', () => {
    renderRuntime({ children: <div data-testid="runtime-children">Extra</div> })
    expect(screen.getByTestId('runtime-children')).toBeInTheDocument()
  })

  // ---- Feature flags ----

  it('does not render card sections when feature disabled', () => {
    const def = {
      ...MINIMAL_DEFINITION,
      features: { ...MINIMAL_DEFINITION.features, cardSections: false },
    }
    renderRuntime({ definition: def })
    expect(screen.queryByTestId('cards-section')).not.toBeInTheDocument()
  })

  it('does not render floating actions when feature disabled', () => {
    const def = {
      ...MINIMAL_DEFINITION,
      features: { ...MINIMAL_DEFINITION.features, floatingActions: false },
    }
    renderRuntime({ definition: def })
    expect(screen.queryByTestId('floating-actions')).not.toBeInTheDocument()
  })

  it('does not render add card modal when addCard feature disabled', () => {
    const def = {
      ...MINIMAL_DEFINITION,
      features: { ...MINIMAL_DEFINITION.features, addCard: false },
    }
    renderRuntime({ definition: def })
    expect(screen.queryByTestId('add-card-modal')).not.toBeInTheDocument()
  })

  it('does not render templates modal when templates feature disabled', () => {
    const def = {
      ...MINIMAL_DEFINITION,
      features: { ...MINIMAL_DEFINITION.features, templates: false },
    }
    renderRuntime({ definition: def })
    expect(screen.queryByTestId('templates-modal')).not.toBeInTheDocument()
  })

  // ---- Add card flow ----

  it('adds cards via the add card modal', () => {
    const addCards = vi.fn()
    const setShowAddCard = vi.fn()
    const setShowCards = vi.fn()
    mockUseDashboard.mockReturnValue(
      makeDashboardReturn({ showAddCard: true, addCards, setShowAddCard, setShowCards }),
    )
    renderRuntime()
    fireEvent.click(screen.getByTestId('modal-add-card'))
    expect(addCards).toHaveBeenCalled()
    expect(setShowAddCard).toHaveBeenCalledWith(false)
    expect(setShowCards).toHaveBeenCalledWith(true)
  })

  it('opens add card modal from empty state button', () => {
    const setShowAddCard = vi.fn()
    mockUseDashboard.mockReturnValue(
      makeDashboardReturn({ cards: [], setShowAddCard }),
    )
    renderRuntime()
    fireEvent.click(screen.getByTestId('empty-add-cards'))
    expect(setShowAddCard).toHaveBeenCalledWith(true)
  })

  // ---- Template application ----

  it('applies template: resets + adds new cards', () => {
    const reset = vi.fn()
    const addCards = vi.fn()
    const setShowTemplates = vi.fn()
    const setShowCards = vi.fn()
    mockUseDashboard.mockReturnValue(
      makeDashboardReturn({ showTemplates: true, reset, addCards, setShowTemplates, setShowCards }),
    )
    renderRuntime()
    fireEvent.click(screen.getByTestId('apply-template'))
    expect(reset).toHaveBeenCalled()
    expect(addCards).toHaveBeenCalledWith([
      { type: 'tmpl_x', title: 'X', config: undefined },
      { type: 'tmpl_y', title: 'Y', config: undefined },
    ])
    expect(setShowTemplates).toHaveBeenCalledWith(false)
    expect(setShowCards).toHaveBeenCalledWith(true)
  })

  // ---- Configure card modal ----

  it('shows configure card modal when configuringCard is set', () => {
    const card = { id: 'r1', card_type: 'card_a', config: {}, title: 'Card A' }
    mockUseDashboard.mockReturnValue(makeDashboardReturn({ configuringCard: card }))
    renderRuntime()
    expect(screen.getByTestId('configure-card-modal')).toBeInTheDocument()
  })

  it('hides configure card modal when configuringCard is null', () => {
    renderRuntime()
    expect(screen.queryByTestId('configure-card-modal')).not.toBeInTheDocument()
  })

  // ---- Card section toggle ----

  it('toggles cards section visibility', () => {
    const setShowCards = vi.fn()
    mockUseDashboard.mockReturnValue(makeDashboardReturn({ setShowCards, showCards: true }))
    renderRuntime()
    fireEvent.click(screen.getByTestId('cards-section-toggle'))
    expect(setShowCards).toHaveBeenCalledWith(false)
  })

  // ---- Floating action buttons ----

  it('opens add card via floating action', () => {
    const setShowAddCard = vi.fn()
    mockUseDashboard.mockReturnValue(makeDashboardReturn({ setShowAddCard }))
    renderRuntime()
    fireEvent.click(screen.getByTestId('fab-add'))
    expect(setShowAddCard).toHaveBeenCalledWith(true)
  })

  it('opens templates via floating action', () => {
    const setShowTemplates = vi.fn()
    mockUseDashboard.mockReturnValue(makeDashboardReturn({ setShowTemplates }))
    renderRuntime()
    fireEvent.click(screen.getByTestId('fab-templates'))
    expect(setShowTemplates).toHaveBeenCalledWith(true)
  })

  it('resets dashboard via floating action', () => {
    const reset = vi.fn()
    mockUseDashboard.mockReturnValue(makeDashboardReturn({ reset }))
    renderRuntime()
    fireEvent.click(screen.getByTestId('fab-reset'))
    expect(reset).toHaveBeenCalled()
  })

  // ---- useDashboard wiring ----

  it('passes definition storageKey and defaultCards to useDashboard', () => {
    renderRuntime()
    expect(mockUseDashboard).toHaveBeenCalledWith(
      expect.objectContaining({
        storageKey: 'test-runtime-cards',
        defaultCards: MINIMAL_DEFINITION.defaultCards,
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// Registry functions
// ---------------------------------------------------------------------------

describe('Dashboard Registry', () => {
  beforeEach(() => {
    // Clear registry between tests via re-registering
  })

  it('registerDashboard stores and getDashboardDefinition retrieves', () => {
    registerDashboard(MINIMAL_DEFINITION)
    const result = getDashboardDefinition('test-dash')
    expect(result).toEqual(MINIMAL_DEFINITION)
  })

  it('getAllDashboardDefinitions returns all registered', () => {
    const def2: DashboardDefinition = { ...MINIMAL_DEFINITION, id: 'dash-2', title: 'Dash 2' }
    registerDashboard(MINIMAL_DEFINITION)
    registerDashboard(def2)
    const all = getAllDashboardDefinitions()
    expect(all.length).toBeGreaterThanOrEqual(2)
    expect(all.find(d => d.id === 'test-dash')).toBeTruthy()
    expect(all.find(d => d.id === 'dash-2')).toBeTruthy()
  })

  it('getDashboardDefinition returns undefined for unknown id', () => {
    expect(getDashboardDefinition('nonexistent-xyz')).toBeUndefined()
  })
})

describe('Stats Value Getter Registry', () => {
  it('registerStatsValueGetter does not throw', () => {
    expect(() => {
      registerStatsValueGetter('test-stats', (blockId) => ({ value: blockId, sublabel: '' }))
    }).not.toThrow()
  })
})

describe('parseDashboardYAML', () => {
  it('throws not-implemented error', () => {
    expect(() => parseDashboardYAML('id: test')).toThrow('YAML parsing not yet implemented')
  })
})
