/**
 * Tests for CardCatalogSection component.
 *
 * Covers: rendering, search filtering, category toggle, card selection,
 * recommended cards, add/clear actions, hover callbacks, sub-modal triggers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ---- mocks ----

const mockShowToast = vi.fn()
const mockOpenCardFactory = vi.fn()
const mockCloseCardFactory = vi.fn()
const mockOpenStatFactory = vi.fn()
const mockCloseStatFactory = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, d?: string | Record<string, unknown>) =>
      typeof d === 'string' ? d : k,
  }),
}))

vi.mock('../../../../../lib/modals', () => ({
  useModalState: () => {
    // Alternate between card factory and stat factory calls
    let callCount = 0
    return () => {
      callCount++
      if (callCount === 1) {
        return { isOpen: false, open: mockOpenCardFactory, close: mockCloseCardFactory }
      }
      return { isOpen: false, open: mockOpenStatFactory, close: mockCloseStatFactory }
    }
  },
}))

// Simpler mock: useModalState is called twice in the component
let modalCallCount = 0
vi.mock('../../../../../lib/modals', () => ({
  useModalState: () => {
    modalCallCount++
    if (modalCallCount % 2 === 1) {
      return { isOpen: false, open: mockOpenCardFactory, close: mockCloseCardFactory }
    }
    return { isOpen: false, open: mockOpenStatFactory, close: mockCloseStatFactory }
  },
}))

vi.mock('../../../../../lib/dynamic-cards', () => ({
  getAllDynamicCards: () => [],
  onRegistryChange: () => () => {},
}))

vi.mock('../../../../ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('../../../../../lib/constants/network', () => ({
  FOCUS_DELAY_MS: 0,
}))

vi.mock('../../../../../lib/analytics', () => ({
  emitCardCategoryBrowsed: vi.fn(),
  emitRecommendedCardShown: vi.fn(),
}))

vi.mock('../../../../../config/cards', () => ({
  isCardVisibleForProject: () => true,
}))

vi.mock('../../../../cards/cardDescriptor', () => ({
  getDescriptorsByCategory: () => new Map(),
}))

vi.mock('../../../../shared/TechnicalAcronym', () => ({
  TechnicalAcronym: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../CardFactoryModal', () => ({
  CardFactoryModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="card-factory-modal">Card Factory</div> : null,
}))

vi.mock('../../../StatBlockFactoryModal', () => ({
  StatBlockFactoryModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="stat-factory-modal">Stat Factory</div> : null,
}))

vi.mock('../../../shared/cardCatalog', () => ({
  CARD_CATALOG: {
    'Cluster Health': [
      { type: 'cluster_status', title: 'Cluster Status', description: 'Overview of cluster health', visualization: 'status' },
      { type: 'node_health', title: 'Node Health', description: 'Node status overview', visualization: 'gauge' },
    ],
    'Workloads': [
      { type: 'pod_status', title: 'Pod Status', description: 'Active pod statuses', visualization: 'table' },
      { type: 'deployment_status', title: 'Deployment Status', description: 'Deployment rollout info', visualization: 'status' },
    ],
  },
  RECOMMENDED_CARD_TYPES: ['cluster_status', 'pod_status', 'deployment_status'] as readonly string[],
  MAX_RECOMMENDED_CARDS: 3,
  CATEGORY_LOCALE_KEYS: { 'Cluster Health': 'clusterHealth', 'Workloads': 'workloads' } as Record<string, string>,
  visualizationIcons: { status: 'S', gauge: 'G', table: 'T', timeseries: 'L', events: 'E', donut: 'D', bar: 'B', sparkline: 'K' } as Record<string, string>,
  wrapAbbreviations: (text: string) => text,
}))

// ---- import after mocks ----
import { CardCatalogSection } from '../CardCatalogSection'

const defaultProps = {
  existingCardTypes: [] as string[],
  onAddCards: vi.fn(),
  onHoverCard: vi.fn(),
  isActive: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  modalCallCount = 0
})

describe('CardCatalogSection', () => {
  it('renders the search input', () => {
    render(<CardCatalogSection {...defaultProps} />)
    expect(screen.getByPlaceholderText('dashboard.addCard.searchCards')).toBeTruthy()
  })

  it('renders Create Custom and Create Stats buttons', () => {
    render(<CardCatalogSection {...defaultProps} />)
    expect(screen.getByText('dashboard.addCard.createCustom')).toBeTruthy()
    expect(screen.getByText('dashboard.addCard.createStats')).toBeTruthy()
  })

  it('renders catalog categories', () => {
    render(<CardCatalogSection {...defaultProps} />)
    expect(screen.getByText('Cluster Health')).toBeTruthy()
    expect(screen.getByText('Workloads')).toBeTruthy()
  })

  it('renders cards within expanded categories', () => {
    render(<CardCatalogSection {...defaultProps} />)
    // Some card titles appear in both recommended and catalog sections
    expect(screen.getAllByText('Cluster Status').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Node Health')).toBeTruthy()
    expect(screen.getAllByText('Pod Status').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Deployment Status').length).toBeGreaterThanOrEqual(1)
  })

  it('renders recommended cards section when no search and cards are available', () => {
    render(<CardCatalogSection {...defaultProps} />)
    expect(screen.getByText('Recommended for you')).toBeTruthy()
  })

  it('hides recommended cards when search is active', () => {
    render(<CardCatalogSection {...defaultProps} />)
    const searchInput = screen.getByPlaceholderText('dashboard.addCard.searchCards')
    fireEvent.change(searchInput, { target: { value: 'pod' } })
    expect(screen.queryByText('Recommended for you')).toBeNull()
  })

  it('hides recommended cards that already exist in dashboard', () => {
    render(
      <CardCatalogSection
        {...defaultProps}
        existingCardTypes={['cluster_status', 'pod_status', 'deployment_status']}
      />
    )
    // All recommended cards already exist, section should not appear
    expect(screen.queryByText('Recommended for you')).toBeNull()
  })

  it('filters catalog cards by search term', () => {
    render(<CardCatalogSection {...defaultProps} />)
    const searchInput = screen.getByPlaceholderText('dashboard.addCard.searchCards')
    fireEvent.change(searchInput, { target: { value: 'deployment' } })

    expect(screen.getByText('Deployment Status')).toBeTruthy()
    expect(screen.queryByText('Cluster Status')).toBeNull()
    expect(screen.queryByText('Node Health')).toBeNull()
  })

  it('shows matching category only when search filters', () => {
    render(<CardCatalogSection {...defaultProps} />)
    const searchInput = screen.getByPlaceholderText('dashboard.addCard.searchCards')
    fireEvent.change(searchInput, { target: { value: 'node' } })

    // Only Cluster Health category should remain
    expect(screen.getByText('Cluster Health')).toBeTruthy()
    expect(screen.queryByText('Workloads')).toBeNull()
  })

  it('collapses and expands a category on click', () => {
    // Use existingCardTypes to exclude recommended cards that duplicate catalog names
    render(<CardCatalogSection {...defaultProps} existingCardTypes={['cluster_status', 'pod_status', 'deployment_status']} />)
    // Node Health is only in catalog (not in recommended), so no duplication
    expect(screen.getByText('Node Health')).toBeTruthy()

    fireEvent.click(screen.getByText('Cluster Health'))
    expect(screen.queryByText('Node Health')).toBeNull()

    fireEvent.click(screen.getByText('Cluster Health'))
    expect(screen.getByText('Node Health')).toBeTruthy()
  })

  it('selects and deselects a card on click', () => {
    // Exclude recommended to avoid duplicate text nodes
    render(<CardCatalogSection {...defaultProps} existingCardTypes={['cluster_status', 'pod_status', 'deployment_status']} />)
    const cardButton = screen.getByText('Node Health').closest('button')!
    fireEvent.click(cardButton)

    // Footer should show selected count
    expect(screen.getByText('dashboard.addCard.cardsSelected')).toBeTruthy()

    // Deselect
    fireEvent.click(cardButton)
    expect(screen.getByText('dashboard.addCard.cardsAvailable')).toBeTruthy()
  })

  it('disables cards that are already added', () => {
    render(<CardCatalogSection {...defaultProps} existingCardTypes={['cluster_status']} />)
    const cardButton = screen.getByText('Cluster Status').closest('button')!
    expect(cardButton).toHaveProperty('disabled', true)
    expect(screen.getByText('dashboard.addCard.added')).toBeTruthy()
  })

  it('calls onAddCards when Add button is clicked', () => {
    const onAddCards = vi.fn()
    // Exclude recommended to avoid duplicate text nodes
    render(<CardCatalogSection {...defaultProps} onAddCards={onAddCards} existingCardTypes={['cluster_status', 'pod_status', 'deployment_status']} />)

    // Select a card that is NOT in existingCardTypes
    const cardButton = screen.getByText('Node Health').closest('button')!
    fireEvent.click(cardButton)

    // Click add
    const addButton = screen.getByText('dashboard.addCard.addCount')
    fireEvent.click(addButton)

    expect(onAddCards).toHaveBeenCalledTimes(1)
    const added = onAddCards.mock.calls[0][0]
    expect(added).toHaveLength(1)
    expect(added[0].type).toBe('node_health')
  })

  it('clears selection when Clear button is clicked', () => {
    render(<CardCatalogSection {...defaultProps} existingCardTypes={['cluster_status', 'pod_status', 'deployment_status']} />)
    // Select a card
    const cardButton = screen.getByText('Node Health').closest('button')!
    fireEvent.click(cardButton)
    expect(screen.getByText('dashboard.addCard.cardsSelected')).toBeTruthy()

    // Click clear
    fireEvent.click(screen.getByText('dashboard.addCard.clear'))
    expect(screen.getByText('dashboard.addCard.cardsAvailable')).toBeTruthy()
  })

  it('calls onHoverCard on mouse enter/leave', () => {
    const onHoverCard = vi.fn()
    render(<CardCatalogSection {...defaultProps} onHoverCard={onHoverCard} />)

    const cardButton = screen.getByText('Node Health').closest('button')!
    fireEvent.mouseEnter(cardButton)
    expect(onHoverCard).toHaveBeenCalledWith(expect.objectContaining({ type: 'node_health' }))

    fireEvent.mouseLeave(cardButton)
    expect(onHoverCard).toHaveBeenCalledWith(null)
  })

  it('selects all cards in a category via Add All button', () => {
    render(<CardCatalogSection {...defaultProps} />)
    const addAllButtons = screen.getAllByText('dashboard.addCard.addAll')
    fireEvent.click(addAllButtons[0])

    // Should have 2 from Cluster Health selected
    expect(screen.getByText('dashboard.addCard.cardsSelected')).toBeTruthy()
  })

  it('deselects all cards in a category when all are selected', () => {
    render(<CardCatalogSection {...defaultProps} />)
    const addAllButtons = screen.getAllByText('dashboard.addCard.addAll')
    // Select all in first category
    fireEvent.click(addAllButtons[0])
    // Now should show Deselect All
    const deselectButton = screen.getByText('dashboard.addCard.deselectAll')
    fireEvent.click(deselectButton)
    // Back to available count
    expect(screen.getByText('dashboard.addCard.cardsAvailable')).toBeTruthy()
  })

  it('uses initialSearch to pre-fill and filter', () => {
    render(<CardCatalogSection {...defaultProps} initialSearch="deployment" />)
    const searchInput = screen.getByPlaceholderText('dashboard.addCard.searchCards') as HTMLInputElement
    expect(searchInput.value).toBe('deployment')
    expect(screen.getByText('Deployment Status')).toBeTruthy()
    expect(screen.queryByText('Cluster Status')).toBeNull()
  })

  it('shows Add Cards button disabled when nothing is selected', () => {
    render(<CardCatalogSection {...defaultProps} />)
    const addButton = screen.getByText('dashboard.addCard.addCards')
    expect(addButton.closest('button')!.hasAttribute('disabled')).toBe(true)
  })

  it('clicking recommended card toggles its selection', () => {
    render(<CardCatalogSection {...defaultProps} />)
    // Find a recommended card button (by its title text)
    const recCard = screen.getAllByText('Cluster Status')
    // The first one is in recommended section, click it
    fireEvent.click(recCard[0].closest('button')!)
    expect(screen.getByText('dashboard.addCard.cardsSelected')).toBeTruthy()
  })

  it('calls onHoverCard when hovering recommended cards', () => {
    const onHoverCard = vi.fn()
    render(<CardCatalogSection {...defaultProps} onHoverCard={onHoverCard} />)
    // Get recommended card buttons (they have Activity icon)
    const recCards = screen.getAllByText('Cluster Status')
    const recButton = recCards[0].closest('button')!
    fireEvent.mouseEnter(recButton)
    expect(onHoverCard).toHaveBeenCalled()
    fireEvent.mouseLeave(recButton)
    expect(onHoverCard).toHaveBeenCalledWith(null)
  })

  it('shows card descriptions in the catalog', () => {
    render(<CardCatalogSection {...defaultProps} />)
    expect(screen.getByText('Overview of cluster health')).toBeTruthy()
    expect(screen.getByText('Active pod statuses')).toBeTruthy()
  })

  it('handles onAddCards error gracefully with toast', () => {
    const onAddCards = vi.fn().mockImplementation(() => { throw new Error('fail') })
    render(<CardCatalogSection {...defaultProps} onAddCards={onAddCards} existingCardTypes={['cluster_status', 'pod_status', 'deployment_status']} />)

    const cardButton = screen.getByText('Node Health').closest('button')!
    fireEvent.click(cardButton)

    const addButton = screen.getByText('dashboard.addCard.addCount')
    fireEvent.click(addButton)

    expect(mockShowToast).toHaveBeenCalledWith('dashboard.addCard.failedToAdd', 'error')
  })
})
