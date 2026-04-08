/**
 * Tests for UnifiedCardsSection component.
 *
 * Covers: rendering, search filtering, category toggle, card selection,
 * AI suggestions flow, add cards action, hover callbacks, footer visibility.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// ---- mocks ----

const mockShowToast = vi.fn()
const mockGenerateCardSuggestions = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, d?: string | Record<string, unknown>) =>
      typeof d === 'string' ? d : k,
  }),
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
  RETRY_DELAY_MS: 0,
}))

vi.mock('../../../../../lib/analytics', () => ({
  emitCardCategoryBrowsed: vi.fn(),
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

vi.mock('../../../shared/cardCatalog', () => ({
  CARD_CATALOG: {
    'Cluster Health': [
      { type: 'cluster_status', title: 'Cluster Status', description: 'Overview of cluster health', visualization: 'status' },
      { type: 'node_health', title: 'Node Health', description: 'Node status overview', visualization: 'gauge' },
    ],
    'Workloads': [
      { type: 'pod_status', title: 'Pod Status', description: 'Active pod statuses', visualization: 'table' },
    ],
  },
  CATEGORY_LOCALE_KEYS: { 'Cluster Health': 'clusterHealth', 'Workloads': 'workloads' } as Record<string, string>,
  visualizationIcons: { status: 'S', gauge: 'G', table: 'T', timeseries: 'L', events: 'E', donut: 'D', bar: 'B', sparkline: 'K' } as Record<string, string>,
  wrapAbbreviations: (text: string) => text,
  generateCardSuggestions: (...args: unknown[]) => mockGenerateCardSuggestions(...args),
}))

// ---- import after mocks ----
import { UnifiedCardsSection } from '../UnifiedCardsSection'

const defaultProps = {
  existingCardTypes: [] as string[],
  onAddCards: vi.fn(),
  onHoverCard: vi.fn(),
  isActive: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGenerateCardSuggestions.mockReturnValue([])
})

describe('UnifiedCardsSection', () => {
  it('renders the search input and AI Suggest button', () => {
    render(<UnifiedCardsSection {...defaultProps} />)
    expect(screen.getByPlaceholderText(/search cards or describe/i)).toBeTruthy()
    expect(screen.getByText('AI Suggest')).toBeTruthy()
  })

  it('renders catalog categories with card counts', () => {
    render(<UnifiedCardsSection {...defaultProps} />)
    // Both categories should be visible
    expect(screen.getByText('Cluster Health')).toBeTruthy()
    expect(screen.getByText('Workloads')).toBeTruthy()
    // Card counts
    expect(screen.getByText(/2 dashboard\.addCard\.cards/)).toBeTruthy()
    expect(screen.getByText(/1 dashboard\.addCard\.cards/)).toBeTruthy()
  })

  it('renders individual cards in expanded categories', () => {
    render(<UnifiedCardsSection {...defaultProps} />)
    expect(screen.getByText('Cluster Status')).toBeTruthy()
    expect(screen.getByText('Node Health')).toBeTruthy()
    expect(screen.getByText('Pod Status')).toBeTruthy()
  })

  it('filters catalog cards by search term', () => {
    render(<UnifiedCardsSection {...defaultProps} />)
    const searchInput = screen.getByPlaceholderText(/search cards or describe/i)
    fireEvent.change(searchInput, { target: { value: 'pod' } })
    // Pod Status should be visible, Cluster cards should be filtered out
    expect(screen.getByText('Pod Status')).toBeTruthy()
    expect(screen.queryByText('Cluster Status')).toBeNull()
    expect(screen.queryByText('Node Health')).toBeNull()
  })

  it('collapses and expands a category on toggle click', () => {
    render(<UnifiedCardsSection {...defaultProps} />)
    // Initially expanded — cards are visible
    expect(screen.getByText('Cluster Status')).toBeTruthy()
    // Click category to collapse
    const categoryButton = screen.getByText('Cluster Health')
    fireEvent.click(categoryButton)
    // Cards inside that category should disappear
    expect(screen.queryByText('Cluster Status')).toBeNull()
    // Click again to expand
    fireEvent.click(categoryButton)
    expect(screen.getByText('Cluster Status')).toBeTruthy()
  })

  it('selects and deselects a browse card on click', () => {
    render(<UnifiedCardsSection {...defaultProps} />)
    const cardButton = screen.getByText('Cluster Status').closest('button')!
    fireEvent.click(cardButton)
    // Footer should show "1 card selected"
    expect(screen.getByText(/1 card selected/)).toBeTruthy()
    // Click again to deselect
    fireEvent.click(cardButton)
    expect(screen.queryByText(/1 card selected/)).toBeNull()
  })

  it('disables already-added cards', () => {
    render(<UnifiedCardsSection {...defaultProps} existingCardTypes={['cluster_status']} />)
    const cardButton = screen.getByText('Cluster Status').closest('button')!
    expect(cardButton).toHaveProperty('disabled', true)
    expect(screen.getByText('dashboard.addCard.added')).toBeTruthy()
  })

  it('calls onAddCards when Add button is clicked with selected browse cards', () => {
    const onAddCards = vi.fn()
    render(<UnifiedCardsSection {...defaultProps} onAddCards={onAddCards} />)
    // Select a card
    const cardButton = screen.getByText('Pod Status').closest('button')!
    fireEvent.click(cardButton)
    // Click add button
    const addButton = screen.getByText(/Add 1 to/)
    fireEvent.click(addButton)
    expect(onAddCards).toHaveBeenCalledTimes(1)
    const addedCards = onAddCards.mock.calls[0][0]
    expect(addedCards).toHaveLength(1)
    expect(addedCards[0].type).toBe('pod_status')
  })

  it('calls onHoverCard on mouse enter/leave over card buttons', () => {
    const onHoverCard = vi.fn()
    render(<UnifiedCardsSection {...defaultProps} onHoverCard={onHoverCard} />)
    const cardButton = screen.getByText('Node Health').closest('button')!
    fireEvent.mouseEnter(cardButton)
    expect(onHoverCard).toHaveBeenCalledWith(expect.objectContaining({ type: 'node_health' }))
    fireEvent.mouseLeave(cardButton)
    expect(onHoverCard).toHaveBeenCalledWith(null)
  })

  it('uses dashboardName in the description and Add button', () => {
    render(<UnifiedCardsSection {...defaultProps} dashboardName="GPU Ops" />)
    const matches = screen.getAllByText(/GPU Ops dashboard/)
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('defaults dashboardLabel to "your dashboard"', () => {
    render(<UnifiedCardsSection {...defaultProps} />)
    const matches = screen.getAllByText(/your dashboard/)
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('renders quick AI example prompts', () => {
    render(<UnifiedCardsSection {...defaultProps} />)
    expect(screen.getByText('Try:')).toBeTruthy()
    // The example buttons use translation keys as text
    expect(screen.getByText('dashboard.addCard.exampleGpuUtil')).toBeTruthy()
  })

  it('generates AI suggestions on Enter key in search', async () => {
    const suggestions = [
      { type: 'gpu_utilization', title: 'GPU Utilization', description: 'GPU usage', visualization: 'gauge' as const, config: {} },
    ]
    mockGenerateCardSuggestions.mockReturnValue(suggestions)

    render(<UnifiedCardsSection {...defaultProps} />)
    const searchInput = screen.getByPlaceholderText(/search cards or describe/i)
    fireEvent.change(searchInput, { target: { value: 'gpu monitoring' } })
    fireEvent.keyDown(searchInput, { key: 'Enter' })

    await waitFor(() => {
      expect(mockGenerateCardSuggestions).toHaveBeenCalledWith('gpu monitoring')
    })
    // AI suggestions section should appear
    await waitFor(() => {
      expect(screen.getByText(/AI Suggestions/)).toBeTruthy()
    })
  })

  it('generates AI suggestions on AI Suggest button click', async () => {
    const suggestions = [
      { type: 'pod_status', title: 'Pod Status', description: 'Pods', visualization: 'table' as const, config: {} },
    ]
    mockGenerateCardSuggestions.mockReturnValue(suggestions)

    render(<UnifiedCardsSection {...defaultProps} />)
    const searchInput = screen.getByPlaceholderText(/search cards or describe/i)
    fireEvent.change(searchInput, { target: { value: 'pods' } })
    fireEvent.click(screen.getByText('AI Suggest'))

    await waitFor(() => {
      expect(mockGenerateCardSuggestions).toHaveBeenCalledWith('pods')
    })
  })

  it('shows AI suggestions and allows toggling selection', async () => {
    const suggestions = [
      { type: 'new_card_1', title: 'New Card 1', description: 'Desc 1', visualization: 'gauge' as const, config: {} },
      { type: 'new_card_2', title: 'New Card 2', description: 'Desc 2', visualization: 'status' as const, config: {} },
    ]
    mockGenerateCardSuggestions.mockReturnValue(suggestions)

    render(<UnifiedCardsSection {...defaultProps} />)
    const searchInput = screen.getByPlaceholderText(/search cards or describe/i)

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'test' } })
      fireEvent.keyDown(searchInput, { key: 'Enter' })
    })

    await waitFor(() => {
      expect(screen.getByText('New Card 1')).toBeTruthy()
      expect(screen.getByText('New Card 2')).toBeTruthy()
    })

    // Both should be auto-selected (not already in existingCardTypes)
    expect(screen.getByText(/2 selected/)).toBeTruthy()

    // Toggle one off
    const card1Button = screen.getByText('New Card 1').closest('button')!
    fireEvent.click(card1Button)
    expect(screen.getByText(/1 selected/)).toBeTruthy()
  })

  it('marks AI suggestion cards that already exist as disabled', async () => {
    const suggestions = [
      { type: 'cluster_status', title: 'Cluster Status', description: 'Already exists', visualization: 'status' as const, config: {} },
    ]
    mockGenerateCardSuggestions.mockReturnValue(suggestions)

    render(<UnifiedCardsSection {...defaultProps} existingCardTypes={['cluster_status']} />)
    const searchInput = screen.getByPlaceholderText(/search cards or describe/i)

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'cluster' } })
      fireEvent.keyDown(searchInput, { key: 'Enter' })
    })

    await waitFor(() => {
      const aiSection = screen.getByText(/AI Suggestions/)
      expect(aiSection).toBeTruthy()
    })

    // The selected count should show 0 since the card is already added
    expect(screen.getByText(/0 selected/)).toBeTruthy()
  })

  it('clears AI suggestions when "Clear & show all cards" is clicked', async () => {
    const suggestions = [
      { type: 'test_card', title: 'Test Card', description: 'Test', visualization: 'status' as const, config: {} },
    ]
    mockGenerateCardSuggestions.mockReturnValue(suggestions)

    render(<UnifiedCardsSection {...defaultProps} />)
    const searchInput = screen.getByPlaceholderText(/search cards or describe/i)

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'test' } })
      fireEvent.keyDown(searchInput, { key: 'Enter' })
    })

    await waitFor(() => {
      expect(screen.getByText(/AI Suggestions/)).toBeTruthy()
    })

    fireEvent.click(screen.getByText(/Clear/))
    expect(screen.queryByText(/AI Suggestions/)).toBeNull()
  })

  it('adds AI-suggested cards via the footer Add button', async () => {
    const onAddCards = vi.fn()
    const suggestions = [
      { type: 'ai_card_1', title: 'AI Card 1', description: 'AI generated', visualization: 'gauge' as const, config: {} },
    ]
    mockGenerateCardSuggestions.mockReturnValue(suggestions)

    render(<UnifiedCardsSection {...defaultProps} onAddCards={onAddCards} />)
    const searchInput = screen.getByPlaceholderText(/search cards or describe/i)

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'ai cards' } })
      fireEvent.keyDown(searchInput, { key: 'Enter' })
    })

    await waitFor(() => {
      expect(screen.getByText('AI Card 1')).toBeTruthy()
    })

    // Click add button in footer
    const addButton = screen.getByText(/Add 1 to/)
    fireEvent.click(addButton)
    expect(onAddCards).toHaveBeenCalledTimes(1)
  })

  it('clears selection when Clear button in footer is clicked', () => {
    render(<UnifiedCardsSection {...defaultProps} />)
    // Select a card
    const cardButton = screen.getByText('Pod Status').closest('button')!
    fireEvent.click(cardButton)
    expect(screen.getByText(/1 card selected/)).toBeTruthy()
    // Click clear
    fireEvent.click(screen.getByText('dashboard.addCard.clear'))
    expect(screen.queryByText(/1 card selected/)).toBeNull()
  })

  it('does not generate AI suggestions when search is empty', () => {
    render(<UnifiedCardsSection {...defaultProps} />)
    const searchInput = screen.getByPlaceholderText(/search cards or describe/i)
    fireEvent.keyDown(searchInput, { key: 'Enter' })
    expect(mockGenerateCardSuggestions).not.toHaveBeenCalled()
  })

  it('selects all cards in a category via Add All button', () => {
    render(<UnifiedCardsSection {...defaultProps} />)
    // Find the "Add All" button for Cluster Health
    const addAllButtons = screen.getAllByText('dashboard.addCard.addAll')
    fireEvent.click(addAllButtons[0])
    // Should select 2 cards from Cluster Health
    expect(screen.getByText(/2 cards selected/)).toBeTruthy()
  })

  it('deselects all cards in a category when all are selected', () => {
    render(<UnifiedCardsSection {...defaultProps} />)
    const addAllButtons = screen.getAllByText('dashboard.addCard.addAll')
    // Select all
    fireEvent.click(addAllButtons[0])
    expect(screen.getByText(/2 cards selected/)).toBeTruthy()
    // Now the button should show Deselect All
    const deselectButton = screen.getByText('dashboard.addCard.deselectAll')
    fireEvent.click(deselectButton)
    expect(screen.queryByText(/2 cards selected/)).toBeNull()
  })

  it('uses initialSearch to pre-fill the search input', () => {
    render(<UnifiedCardsSection {...defaultProps} initialSearch="node" />)
    const searchInput = screen.getByPlaceholderText(/search cards or describe/i) as HTMLInputElement
    expect(searchInput.value).toBe('node')
    // Should filter to show only Node Health
    expect(screen.getByText('Node Health')).toBeTruthy()
    expect(screen.queryByText('Pod Status')).toBeNull()
  })

  it('clicking a quick AI example triggers generation', async () => {
    mockGenerateCardSuggestions.mockReturnValue([])

    render(<UnifiedCardsSection {...defaultProps} />)
    const exampleButton = screen.getByText('dashboard.addCard.exampleGpuUtil')

    await act(async () => {
      fireEvent.click(exampleButton)
    })

    await waitFor(() => {
      expect(mockGenerateCardSuggestions).toHaveBeenCalledWith('dashboard.addCard.exampleGpuUtil')
    })
  })
})
