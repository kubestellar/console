import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiscoverCardsPlaceholder } from './DiscoverCardsPlaceholder'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

// Mock formatCardTitle to return a readable title
vi.mock('../../lib/formatCardTitle', () => ({
  formatCardTitle: (type: string) => type.replace(/_/g, ' '),
}))

describe('DiscoverCardsPlaceholder Component', () => {
  const defaultProps = {
    existingCardTypes: [] as string[],
    onAddCard: vi.fn(),
    onOpenCatalog: vi.fn(),
  }

  it('renders the first available card suggestion', () => {
    render(<DiscoverCardsPlaceholder {...defaultProps} />)
    expect(screen.getByText('gpu overview')).toBeInTheDocument()
    expect(screen.getByText('GPU utilization across clusters')).toBeInTheDocument()
  })

  it('shows Add this card and Browse all buttons', () => {
    render(<DiscoverCardsPlaceholder {...defaultProps} />)
    expect(screen.getByText('Add this card')).toBeInTheDocument()
    expect(screen.getByText('Browse all')).toBeInTheDocument()
  })

  it('calls onAddCard when Add this card is clicked', () => {
    const onAddCard = vi.fn()
    render(<DiscoverCardsPlaceholder {...defaultProps} onAddCard={onAddCard} />)
    fireEvent.click(screen.getByText('Add this card'))
    expect(onAddCard).toHaveBeenCalledWith('gpu_overview')
  })

  it('calls onOpenCatalog when Browse all is clicked', () => {
    const onOpenCatalog = vi.fn()
    render(<DiscoverCardsPlaceholder {...defaultProps} onOpenCatalog={onOpenCatalog} />)
    fireEvent.click(screen.getByText('Browse all'))
    expect(onOpenCatalog).toHaveBeenCalledOnce()
  })

  it('filters out existing card types', () => {
    render(
      <DiscoverCardsPlaceholder
        {...defaultProps}
        existingCardTypes={['gpu_overview']}
      />,
    )
    // Should show node_status instead since gpu_overview is filtered out
    expect(screen.getByText('node status')).toBeInTheDocument()
  })

  it('returns null when all cards already exist', () => {
    const allTypes = [
      'gpu_overview', 'node_status', 'security_issues', 'nightly_e2e_status',
      'helm_releases', 'namespace_overview', 'workload_deployment', 'cost_overview',
    ]
    const { container } = render(
      <DiscoverCardsPlaceholder {...defaultProps} existingCardTypes={allTypes} />,
    )
    expect(container.firstChild).toBeNull()
  })
})
