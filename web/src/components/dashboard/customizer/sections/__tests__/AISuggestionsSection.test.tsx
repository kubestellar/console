import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ---- mocks ----
const mockGenerateCardSuggestions = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, d?: string | Record<string, unknown>) =>
      typeof d === 'string' ? d : k,
  }),
}))

vi.mock('../../../shared/cardCatalog', () => ({
  visualizationIcons: { chart: '📊', table: '📋' },
  wrapAbbreviations: (text: string) => text,
  generateCardSuggestions: (...args: unknown[]) => mockGenerateCardSuggestions(...args),
}))

// Mock RETRY_DELAY_MS to 0 so setTimeout resolves near-instantly
vi.mock('../../../../../lib/constants/network', () => ({
  RETRY_DELAY_MS: 0,
}))

import { AISuggestionsSection } from '../AISuggestionsSection'

describe('AISuggestionsSection', () => {
  const defaultProps = {
    existingCardTypes: [] as string[],
    onAddCards: vi.fn(),
    dashboardName: 'My Dashboard',
    onHoverCard: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders query input and generate button', () => {
    render(<AISuggestionsSection {...defaultProps} />)
    expect(screen.getByPlaceholderText('dashboard.addCard.aiPlaceholder')).toBeInTheDocument()
    expect(screen.getByText('dashboard.addCard.generate')).toBeInTheDocument()
  })

  it('renders example query buttons', () => {
    render(<AISuggestionsSection {...defaultProps} />)
    expect(screen.getByText('dashboard.addCard.exampleGpuUtil')).toBeInTheDocument()
    expect(screen.getByText('dashboard.addCard.examplePodIssues')).toBeInTheDocument()
  })

  it('disables generate button when query is empty', () => {
    render(<AISuggestionsSection {...defaultProps} />)
    const btn = screen.getByText('dashboard.addCard.generate').closest('button')!
    expect(btn).toBeDisabled()
  })

  it('generates suggestions when clicking an example query', async () => {
    const suggestions = [
      { type: 'card-a', title: 'Card A', description: 'Desc A', visualization: 'chart' },
    ]
    mockGenerateCardSuggestions.mockReturnValue(suggestions)

    render(<AISuggestionsSection {...defaultProps} />)

    // Example button passes the query directly to handleGenerateWithQuery, bypassing state
    fireEvent.click(screen.getByText('dashboard.addCard.exampleGpuUtil'))

    await waitFor(() => {
      expect(mockGenerateCardSuggestions).toHaveBeenCalledWith('dashboard.addCard.exampleGpuUtil')
    })
    expect(screen.getByText('Card A')).toBeInTheDocument()
  })

  it('marks existing cards as already added via example query', async () => {
    const suggestions = [
      { type: 'existing-card', title: 'Existing', description: 'D', visualization: 'chart' },
    ]
    mockGenerateCardSuggestions.mockReturnValue(suggestions)

    render(<AISuggestionsSection {...defaultProps} existingCardTypes={['existing-card']} />)

    fireEvent.click(screen.getByText('dashboard.addCard.exampleGpuUtil'))

    await waitFor(() => {
      expect(screen.getByText('dashboard.addCard.alreadyAdded')).toBeInTheDocument()
    })
  })

  it('toggles card selection and calls onAddCards', async () => {
    const suggestions = [
      { type: 'card-a', title: 'Card A', description: 'D', visualization: 'chart' },
      { type: 'card-b', title: 'Card B', description: 'D', visualization: 'table' },
    ]
    mockGenerateCardSuggestions.mockReturnValue(suggestions)

    const onAddCards = vi.fn()
    render(<AISuggestionsSection {...defaultProps} onAddCards={onAddCards} />)

    fireEvent.click(screen.getByText('dashboard.addCard.exampleGpuUtil'))

    await waitFor(() => {
      expect(screen.getByText('Card A')).toBeInTheDocument()
    })

    // Both auto-selected; deselect card-a
    fireEvent.click(screen.getByText('Card A').closest('button')!)

    // Add remaining selected cards
    fireEvent.click(screen.getByText(/dashboard\.addCard\.addCount/).closest('button')!)
    expect(onAddCards).toHaveBeenCalledWith([suggestions[1]])
  })

  it('triggers onHoverCard on mouse enter/leave', async () => {
    const suggestions = [
      { type: 'card-a', title: 'Card A', description: 'Desc A', visualization: 'chart' },
    ]
    mockGenerateCardSuggestions.mockReturnValue(suggestions)
    const onHoverCard = vi.fn()

    render(<AISuggestionsSection {...defaultProps} onHoverCard={onHoverCard} />)

    fireEvent.click(screen.getByText('dashboard.addCard.exampleGpuUtil'))

    await waitFor(() => {
      expect(screen.getByText('Card A')).toBeInTheDocument()
    })

    const cardBtn = screen.getByText('Card A').closest('button')!
    fireEvent.mouseEnter(cardBtn)
    expect(onHoverCard).toHaveBeenCalledWith(suggestions[0])

    fireEvent.mouseLeave(cardBtn)
    expect(onHoverCard).toHaveBeenCalledWith(null)
  })

  it('generates via input and Enter key', async () => {
    // Use the input + Enter path. The Enter handler calls handleGenerate()
    // which reads query from state.
    mockGenerateCardSuggestions.mockReturnValue([
      { type: 'card-a', title: 'Card A', description: 'Desc', visualization: 'chart' },
    ])

    render(<AISuggestionsSection {...defaultProps} />)
    const input = screen.getByPlaceholderText('dashboard.addCard.aiPlaceholder')

    // Change the input and let React update state
    fireEvent.change(input, { target: { value: 'pods' } })

    // Press Enter — handleGenerate reads query from state
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockGenerateCardSuggestions).toHaveBeenCalledWith('pods')
    })
  })

  it('generates via input and generate button click', async () => {
    const suggestions = [
      { type: 'card-a', title: 'Card A', description: 'Desc A', visualization: 'chart' },
      { type: 'card-b', title: 'Card B', description: 'Desc B', visualization: 'table' },
    ]
    mockGenerateCardSuggestions.mockReturnValue(suggestions)

    render(<AISuggestionsSection {...defaultProps} />)
    const input = screen.getByPlaceholderText('dashboard.addCard.aiPlaceholder')

    fireEvent.change(input, { target: { value: 'gpu monitoring' } })
    fireEvent.click(screen.getByText('dashboard.addCard.generate').closest('button')!)

    await waitFor(() => {
      expect(mockGenerateCardSuggestions).toHaveBeenCalledWith('gpu monitoring')
    })
    expect(screen.getByText('Card A')).toBeInTheDocument()
    expect(screen.getByText('Card B')).toBeInTheDocument()
  })
})
