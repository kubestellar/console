/**
 * Tests for UnifiedDashboard component
 *
 * Mocks all heavy child components (DashboardGrid, AddCardModal, etc.)
 * and tests the orchestration logic: card management, tab switching,
 * localStorage persistence, reset, refresh, and modal toggling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { UnifiedDashboard } from '../UnifiedDashboard'
import type { UnifiedDashboardConfig, DashboardCardPlacement } from '../../types'

// ---------------------------------------------------------------------------
// Mock child components to isolate UnifiedDashboard logic
// ---------------------------------------------------------------------------

let capturedGridProps: Record<string, unknown> = {}
vi.mock('../DashboardGrid', () => ({
  DashboardGrid: (props: Record<string, unknown>) => {
    capturedGridProps = props
    return <div data-testid="dashboard-grid">DashboardGrid</div>
  },
}))

let capturedAddCardProps: Record<string, unknown> = {}
vi.mock('../../../../components/dashboard/AddCardModal', () => ({
  AddCardModal: (props: Record<string, unknown>) => {
    capturedAddCardProps = props
    return props.isOpen ? <div data-testid="add-card-modal">AddCardModal</div> : null
  },
}))

let capturedConfigureCardProps: Record<string, unknown> = {}
vi.mock('../../../../components/dashboard/ConfigureCardModal', () => ({
  ConfigureCardModal: (props: Record<string, unknown>) => {
    capturedConfigureCardProps = props
    return props.isOpen ? <div data-testid="configure-card-modal">ConfigureCardModal</div> : null
  },
}))

vi.mock('../../stats', () => ({
  UnifiedStatsSection: (props: Record<string, unknown>) => (
    <div data-testid="stats-section" data-loading={props.isLoading}>
      StatsSection
    </div>
  ),
}))

vi.mock('../../../../components/dashboard/DashboardHealthIndicator', () => ({
  DashboardHealthIndicator: () => <div data-testid="health-indicator">Health</div>,
}))

vi.mock('../../../../components/cards/cardRegistry', () => ({
  prefetchCardChunks: vi.fn(),
}))

vi.mock('../../../../components/agent/AgentIcon', () => ({
  AgentIcon: (props: { provider: string }) => <span data-testid={`agent-icon-${props.provider}`} />,
}))

/** Speed up refresh timer */
vi.mock('../../../constants/network', () => ({
  SHORT_DELAY_MS: 5,
}))

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeCard = (id: string, cardType = 'test-card'): DashboardCardPlacement => ({
  id,
  cardType,
  title: `Card ${id}`,
  position: { w: 6, h: 3 },
})

const makeConfig = (overrides?: Partial<UnifiedDashboardConfig>): UnifiedDashboardConfig => ({
  id: 'test-dashboard',
  name: 'Test Dashboard',
  subtitle: 'A test subtitle',
  cards: [makeCard('card-1'), makeCard('card-2', 'other-card')],
  features: {},
  ...overrides,
})

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  capturedGridProps = {}
  capturedAddCardProps = {}
  capturedConfigureCardProps = {}
  vi.useFakeTimers()
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

// ============================================================================
// Basic rendering
// ============================================================================

describe('UnifiedDashboard rendering', () => {
  it('renders dashboard name and subtitle', () => {
    const config = makeConfig()
    render(<UnifiedDashboard config={config} />)
    expect(screen.getByText('Test Dashboard')).toBeDefined()
    expect(screen.getByText('A test subtitle')).toBeDefined()
  })

  it('renders DashboardGrid with cards', () => {
    const config = makeConfig()
    render(<UnifiedDashboard config={config} />)
    expect(screen.getByTestId('dashboard-grid')).toBeDefined()
    const cards = capturedGridProps.cards as DashboardCardPlacement[]
    expect(cards).toHaveLength(2)
  })

  it('renders health indicator', () => {
    render(<UnifiedDashboard config={makeConfig()} />)
    expect(screen.getByTestId('health-indicator')).toBeDefined()
  })

  it('renders stats section when config has stats', () => {
    const config = makeConfig({
      stats: {
        blocks: [{ label: 'Clusters', value: 5, color: 'blue' as const }],
      },
    })
    render(<UnifiedDashboard config={config} statsData={{ clusters: 5 }} />)
    expect(screen.getByTestId('stats-section')).toBeDefined()
  })

  it('does not render stats section without stats config', () => {
    render(<UnifiedDashboard config={makeConfig()} />)
    expect(screen.queryByTestId('stats-section')).toBeNull()
  })

  it('applies custom className', () => {
    const { container } = render(
      <UnifiedDashboard config={makeConfig()} className="custom-class" />
    )
    expect(container.firstElementChild?.className).toContain('custom-class')
  })
})

// ============================================================================
// Card management
// ============================================================================

describe('Card removal', () => {
  it('removes a card when onRemoveCard is called', () => {
    const config = makeConfig()
    render(<UnifiedDashboard config={config} />)

    // Simulate DashboardGrid calling onRemoveCard
    const onRemoveCard = capturedGridProps.onRemoveCard as (id: string) => void
    act(() => { onRemoveCard('card-1') })

    const cards = capturedGridProps.cards as DashboardCardPlacement[]
    expect(cards).toHaveLength(1)
    expect(cards[0].id).toBe('card-2')
  })
})

describe('Card reorder', () => {
  it('reorders cards when onReorder is called', () => {
    const config = makeConfig()
    render(<UnifiedDashboard config={config} />)

    const reordered = [makeCard('card-2', 'other-card'), makeCard('card-1')]
    const onReorder = capturedGridProps.onReorder as (cards: DashboardCardPlacement[]) => void
    act(() => { onReorder(reordered) })

    const cards = capturedGridProps.cards as DashboardCardPlacement[]
    expect(cards[0].id).toBe('card-2')
    expect(cards[1].id).toBe('card-1')
  })
})

describe('Card configuration', () => {
  it('opens configure modal when onConfigureCard is called', () => {
    const config = makeConfig()
    render(<UnifiedDashboard config={config} />)

    expect(screen.queryByTestId('configure-card-modal')).toBeNull()

    const onConfigureCard = capturedGridProps.onConfigureCard as (id: string) => void
    act(() => { onConfigureCard('card-1') })

    expect(screen.getByTestId('configure-card-modal')).toBeDefined()
    const cardProp = capturedConfigureCardProps.card as { id: string; card_type: string }
    expect(cardProp.id).toBe('card-1')
    expect(cardProp.card_type).toBe('test-card')
  })

  it('saves card config via onSave callback', () => {
    const config = makeConfig()
    render(<UnifiedDashboard config={config} />)

    // Open configure modal
    const onConfigureCard = capturedGridProps.onConfigureCard as (id: string) => void
    act(() => { onConfigureCard('card-1') })

    // Save new config
    const onSave = capturedConfigureCardProps.onSave as (
      id: string, cfg: Record<string, unknown>, title?: string
    ) => void
    act(() => { onSave('card-1', { color: 'blue' }, 'New Title') })

    // Modal should close
    expect(screen.queryByTestId('configure-card-modal')).toBeNull()

    // Card should be updated
    const cards = capturedGridProps.cards as DashboardCardPlacement[]
    const updated = cards.find(c => c.id === 'card-1')
    expect(updated?.config).toEqual({ color: 'blue' })
    expect(updated?.title).toBe('New Title')
  })

  it('ignores configure for non-existent card', () => {
    const config = makeConfig()
    render(<UnifiedDashboard config={config} />)

    const onConfigureCard = capturedGridProps.onConfigureCard as (id: string) => void
    act(() => { onConfigureCard('nonexistent') })

    // Modal should not open
    expect(screen.queryByTestId('configure-card-modal')).toBeNull()
  })
})

describe('Add card via modal', () => {
  it('opens add card modal on add button click', () => {
    const config = makeConfig()
    render(<UnifiedDashboard config={config} />)

    expect(screen.queryByTestId('add-card-modal')).toBeNull()

    const addBtn = screen.getByTitle('Add card')
    fireEvent.click(addBtn)

    expect(screen.getByTestId('add-card-modal')).toBeDefined()
  })

  it('adds new cards from AddCardModal', () => {
    const config = makeConfig()
    render(<UnifiedDashboard config={config} />)

    // Open modal
    fireEvent.click(screen.getByTitle('Add card'))

    // Simulate AddCardModal calling onAddCards
    const onAddCards = capturedAddCardProps.onAddCards as (cards: unknown[]) => void
    act(() => {
      onAddCards([
        { type: 'new-type', title: 'New Card', description: 'desc', visualization: 'table', config: {} },
      ])
    })

    // Modal should close
    expect(screen.queryByTestId('add-card-modal')).toBeNull()

    // Cards should include the new one
    const cards = capturedGridProps.cards as DashboardCardPlacement[]
    expect(cards).toHaveLength(3)
    expect(cards[2].cardType).toBe('new-type')
    expect(cards[2].title).toBe('New Card')
  })

  it('closes add card modal via onClose', () => {
    render(<UnifiedDashboard config={makeConfig()} />)
    fireEvent.click(screen.getByTitle('Add card'))
    expect(screen.getByTestId('add-card-modal')).toBeDefined()

    const onClose = capturedAddCardProps.onClose as () => void
    act(() => { onClose() })

    expect(screen.queryByTestId('add-card-modal')).toBeNull()
  })
})

// ============================================================================
// Refresh
// ============================================================================

describe('Refresh', () => {
  it('shows loading state and updates timestamp on refresh', async () => {
    render(<UnifiedDashboard config={makeConfig()} />)

    const refreshBtn = screen.getByTitle('Refresh')
    fireEvent.click(refreshBtn)

    // Should be loading
    expect(capturedGridProps.isLoading).toBe(true)

    // Advance past the SHORT_DELAY_MS
    await act(async () => { vi.advanceTimersByTime(10) })

    expect(capturedGridProps.isLoading).toBe(false)
    // "Updated" timestamp should appear
    expect(screen.getByText(/Updated/)).toBeDefined()
  })

  it('hides refresh button when autoRefresh feature is false', () => {
    const config = makeConfig({ features: { autoRefresh: false } })
    render(<UnifiedDashboard config={config} />)
    expect(screen.queryByTitle('Refresh')).toBeNull()
  })
})

// ============================================================================
// Reset to defaults
// ============================================================================

describe('Reset to defaults', () => {
  it('shows reset button when cards differ from defaults', () => {
    const config = makeConfig()
    render(<UnifiedDashboard config={config} />)

    // Remove a card to make it different from defaults
    const onRemoveCard = capturedGridProps.onRemoveCard as (id: string) => void
    act(() => { onRemoveCard('card-1') })

    expect(screen.getByText('Reset')).toBeDefined()
  })

  it('restores default cards on reset click', () => {
    const config = makeConfig()
    render(<UnifiedDashboard config={config} />)

    // Remove a card
    const onRemoveCard = capturedGridProps.onRemoveCard as (id: string) => void
    act(() => { onRemoveCard('card-1') })

    // Click reset
    fireEvent.click(screen.getByText('Reset'))

    const cards = capturedGridProps.cards as DashboardCardPlacement[]
    expect(cards).toHaveLength(2)
  })

  it('calls localStorage.removeItem on reset when storageKey is set', () => {
    const storageKey = 'test-dashboard-cards'
    const config = makeConfig({ storageKey })
    // Store a different card set so initial state is customized
    localStorage.setItem(storageKey, JSON.stringify([makeCard('custom')]))

    const removeSpy = vi.spyOn(localStorage, 'removeItem')

    render(<UnifiedDashboard config={config} />)

    // Cards loaded from localStorage differ from config.cards, so Reset is visible
    fireEvent.click(screen.getByText('Reset'))
    expect(removeSpy).toHaveBeenCalledWith(storageKey)
    removeSpy.mockRestore()
  })
})

// ============================================================================
// localStorage persistence
// ============================================================================

describe('localStorage persistence', () => {
  it('loads cards from localStorage when storageKey is set', () => {
    const storageKey = 'persist-test'
    const storedCards = [makeCard('stored-1'), makeCard('stored-2'), makeCard('stored-3')]
    localStorage.setItem(storageKey, JSON.stringify(storedCards))

    const config = makeConfig({ storageKey })
    render(<UnifiedDashboard config={config} />)

    const cards = capturedGridProps.cards as DashboardCardPlacement[]
    expect(cards).toHaveLength(3)
    expect(cards[0].id).toBe('stored-1')
  })

  it('falls back to config cards when localStorage is empty', () => {
    const config = makeConfig({ storageKey: 'empty-key' })
    render(<UnifiedDashboard config={config} />)

    const cards = capturedGridProps.cards as DashboardCardPlacement[]
    expect(cards).toHaveLength(2)
  })

  it('falls back to config cards when localStorage has invalid JSON', () => {
    const storageKey = 'bad-json'
    localStorage.setItem(storageKey, 'not-json{{{')
    const config = makeConfig({ storageKey })
    render(<UnifiedDashboard config={config} />)

    const cards = capturedGridProps.cards as DashboardCardPlacement[]
    expect(cards).toHaveLength(2)
  })

  it('falls back to config cards when localStorage has empty array', () => {
    const storageKey = 'empty-arr'
    localStorage.setItem(storageKey, '[]')
    const config = makeConfig({ storageKey })
    render(<UnifiedDashboard config={config} />)

    const cards = capturedGridProps.cards as DashboardCardPlacement[]
    expect(cards).toHaveLength(2)
  })

  it('persists cards to localStorage when they change', () => {
    const storageKey = 'write-test'
    const config = makeConfig({ storageKey })
    render(<UnifiedDashboard config={config} />)

    // Remove a card to trigger a state change
    const onRemoveCard = capturedGridProps.onRemoveCard as (id: string) => void
    act(() => { onRemoveCard('card-1') })

    const stored = JSON.parse(localStorage.getItem(storageKey) || '[]')
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe('card-2')
  })
})

// ============================================================================
// Tab switching
// ============================================================================

describe('Tab switching', () => {
  const tabConfig = makeConfig({
    cards: [],
    tabs: [
      { id: 'tab-1', label: 'Overview', cards: [makeCard('t1-card-1')], icon: 'k8s' },
      { id: 'tab-2', label: 'Resources', cards: [makeCard('t2-card-1'), makeCard('t2-card-2')] },
      { id: 'tab-3', label: 'Disabled', cards: [], disabled: true, installUrl: 'https://example.com' },
    ],
  })

  it('renders tab buttons', () => {
    render(<UnifiedDashboard config={tabConfig} />)
    expect(screen.getByText('Overview')).toBeDefined()
    expect(screen.getByText('Resources')).toBeDefined()
    expect(screen.getByText('Disabled')).toBeDefined()
  })

  it('defaults to first non-disabled tab', () => {
    render(<UnifiedDashboard config={tabConfig} />)
    const cards = capturedGridProps.cards as DashboardCardPlacement[]
    expect(cards).toHaveLength(1)
    expect(cards[0].id).toBe('t1-card-1')
  })

  it('switches to another tab on click', () => {
    render(<UnifiedDashboard config={tabConfig} />)

    fireEvent.click(screen.getByText('Resources'))

    const cards = capturedGridProps.cards as DashboardCardPlacement[]
    expect(cards).toHaveLength(2)
    expect(cards[0].id).toBe('t2-card-1')
  })

  it('does not switch to disabled tab', () => {
    render(<UnifiedDashboard config={tabConfig} />)

    fireEvent.click(screen.getByText('Disabled'))

    // Should still be on first tab
    const cards = capturedGridProps.cards as DashboardCardPlacement[]
    expect(cards).toHaveLength(1)
    expect(cards[0].id).toBe('t1-card-1')
  })

  it('renders install link for disabled tab', () => {
    render(<UnifiedDashboard config={tabConfig} />)
    const installLink = screen.getByText('Install')
    expect(installLink.closest('a')?.href).toBe('https://example.com/')
  })

  it('renders AgentIcon for tabs with icon', () => {
    render(<UnifiedDashboard config={tabConfig} />)
    expect(screen.getByTestId('agent-icon-k8s')).toBeDefined()
  })
})

// ============================================================================
// Empty state
// ============================================================================

describe('Empty state', () => {
  it('shows empty state when no cards and no tabs', () => {
    const config = makeConfig({ cards: [] })
    render(<UnifiedDashboard config={config} />)
    expect(screen.getByText('No cards configured')).toBeDefined()
    expect(screen.getByText('Add your first card')).toBeDefined()
  })

  it('does not show empty state when tabs are present', () => {
    const config = makeConfig({
      cards: [],
      tabs: [{ id: 't1', label: 'Tab 1', cards: [] }],
    })
    render(<UnifiedDashboard config={config} />)
    expect(screen.queryByText('No cards configured')).toBeNull()
  })

  it('hides add-first-card button when addCard feature is disabled', () => {
    const config = makeConfig({ cards: [], features: { addCard: false } })
    render(<UnifiedDashboard config={config} />)
    expect(screen.queryByText('Add your first card')).toBeNull()
  })
})

// ============================================================================
// Feature flags
// ============================================================================

describe('Feature flags', () => {
  it('hides add card button when addCard feature is false', () => {
    const config = makeConfig({ features: { addCard: false } })
    render(<UnifiedDashboard config={config} />)
    expect(screen.queryByTitle('Add card')).toBeNull()
  })

  it('disables drag-drop by setting onReorder to undefined', () => {
    const config = makeConfig({ features: { dragDrop: false } })
    render(<UnifiedDashboard config={config} />)
    expect(capturedGridProps.onReorder).toBeUndefined()
  })

  it('enables drag-drop by default', () => {
    render(<UnifiedDashboard config={makeConfig()} />)
    expect(capturedGridProps.onReorder).toBeDefined()
  })
})

// ============================================================================
// Configure modal close
// ============================================================================

describe('Configure card modal close', () => {
  it('closes configure modal and clears cardToEdit on close callback', () => {
    render(<UnifiedDashboard config={makeConfig()} />)

    // Open configure modal
    const onConfigureCard = capturedGridProps.onConfigureCard as (id: string) => void
    act(() => { onConfigureCard('card-1') })
    expect(screen.getByTestId('configure-card-modal')).toBeDefined()

    // Close via the onClose callback
    const onClose = capturedConfigureCardProps.onClose as () => void
    act(() => { onClose() })

    expect(screen.queryByTestId('configure-card-modal')).toBeNull()
  })
})
