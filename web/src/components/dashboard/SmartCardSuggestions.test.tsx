import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SmartCardSuggestions } from './SmartCardSuggestions'

// Mock dependencies
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({
    status: 'connected',
    health: { clusters: 2 },
  }),
}))

vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => ({
    deduplicatedClusters: [
      { name: 'cluster-1', namespaces: ['default', 'gpu-operator'], podCount: 10, nodeCount: 3 },
      { name: 'cluster-2', namespaces: ['default', 'monitoring'], podCount: 5, nodeCount: 2 },
    ],
  }),
}))

vi.mock('../../lib/analytics', () => ({
  emitSmartSuggestionsShown: vi.fn(),
  emitSmartSuggestionAccepted: vi.fn(),
  emitSmartSuggestionsAddAll: vi.fn(),
}))

vi.mock('../../lib/utils/localStorage', () => ({
  safeGetItem: vi.fn(() => null),
  safeSetItem: vi.fn(),
}))

vi.mock('../../lib/formatCardTitle', () => ({
  formatCardTitle: (type: string) => type.replace(/_/g, ' '),
}))

describe('SmartCardSuggestions Component', () => {
  const defaultProps = {
    existingCardTypes: [] as string[],
    onAddCard: vi.fn(),
    onAddMultipleCards: vi.fn(),
  }

  it('renders nothing before the delay elapses', () => {
    const { container } = render(<SmartCardSuggestions {...defaultProps} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders suggestions after delay', () => {
    vi.useFakeTimers()
    render(<SmartCardSuggestions {...defaultProps} />)

    const SUGGESTION_SHOW_DELAY_MS = 30_000
    act(() => {
      vi.advanceTimersByTime(SUGGESTION_SHOW_DELAY_MS)
    })

    expect(screen.getByText('Smart Suggestions')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('shows Add all and Dismiss buttons', () => {
    vi.useFakeTimers()
    render(<SmartCardSuggestions {...defaultProps} />)

    const SUGGESTION_SHOW_DELAY_MS = 30_000
    act(() => {
      vi.advanceTimersByTime(SUGGESTION_SHOW_DELAY_MS)
    })

    expect(screen.getByText('Add all')).toBeInTheDocument()
    expect(screen.getByTitle('Dismiss')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('calls onAddCard when a suggestion is clicked', () => {
    vi.useFakeTimers()
    const onAddCard = vi.fn()
    render(<SmartCardSuggestions {...defaultProps} onAddCard={onAddCard} />)

    const SUGGESTION_SHOW_DELAY_MS = 30_000
    act(() => {
      vi.advanceTimersByTime(SUGGESTION_SHOW_DELAY_MS)
    })

    // Click the first suggestion card (gpu_overview should appear since cluster has gpu-operator namespace)
    const suggestionButtons = screen.getAllByRole('button')
    // Find the suggestion button (not Add all / Dismiss)
    const gpuButton = suggestionButtons.find(btn => btn.textContent?.includes('gpu overview'))
    expect(gpuButton).toBeTruthy()
    fireEvent.click(gpuButton!)

    expect(onAddCard).toHaveBeenCalledWith('gpu_overview')
    vi.useRealTimers()
  })

  it('hides when dismiss is clicked', () => {
    vi.useFakeTimers()
    render(<SmartCardSuggestions {...defaultProps} />)

    const SUGGESTION_SHOW_DELAY_MS = 30_000
    act(() => {
      vi.advanceTimersByTime(SUGGESTION_SHOW_DELAY_MS)
    })

    fireEvent.click(screen.getByTitle('Dismiss'))
    expect(screen.queryByText('Smart Suggestions')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})
