import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AddCardBrowsePanel } from './AddCardBrowsePanel'
import type { CardCatalogEntry, CardCatalogMap } from './addCardModal.types'

vi.mock('./shared/cardCatalog', () => ({
  CATEGORY_LOCALE_KEYS: {},
  visualizationIcons: { table: '📋', chart: '📊' },
  wrapAbbreviations: (text: string) => text,
}))

const t = (key: string) => key
const tCard = (_key: string, fallback?: string) => fallback ?? _key

const cardA: CardCatalogEntry = { type: 'card-a', title: 'Card A', description: 'Description A', visualization: 'table' }
const cardB: CardCatalogEntry = { type: 'card-b', title: 'Card B', description: 'Description B', visualization: 'chart' }

const filteredCatalog: CardCatalogMap = {
  Monitoring: [cardA, cardB],
}

const baseProps = {
  browseSearch: '',
  existingCardTypes: [],
  expandedCategories: new Set<string>(['Monitoring']),
  filteredCatalog,
  openCardFactory: vi.fn(),
  openStatFactory: vi.fn(),
  recommendedCards: [],
  searchInputRef: { current: null },
  selectedBrowseCards: new Set<string>(),
  t,
  tCard,
  onBrowseSearchChange: vi.fn(),
  onHoverCardChange: vi.fn(),
  onSelectedBrowseCardsChange: vi.fn(),
  onToggleBrowseCard: vi.fn(),
  onToggleCategory: vi.fn(),
}

describe('AddCardBrowsePanel Component', () => {
  it('renders a button for each card in an expanded category', () => {
    render(<AddCardBrowsePanel {...baseProps} />)

    expect(screen.getByText('Card A')).toBeVisible()
    expect(screen.getByText('Card B')).toBeVisible()
  })

  it('calls onBrowseSearchChange when the search input changes', () => {
    const onBrowseSearchChange = vi.fn()
    render(<AddCardBrowsePanel {...baseProps} onBrowseSearchChange={onBrowseSearchChange} />)

    fireEvent.change(screen.getByPlaceholderText('dashboard.addCard.searchCards'), { target: { value: 'pod' } })

    expect(onBrowseSearchChange).toHaveBeenCalledWith('pod')
  })

  it('calls onToggleBrowseCard when a card button is clicked', () => {
    const onToggleBrowseCard = vi.fn()
    render(<AddCardBrowsePanel {...baseProps} onToggleBrowseCard={onToggleBrowseCard} />)

    fireEvent.click(screen.getByText('Card A'))

    expect(onToggleBrowseCard).toHaveBeenCalledWith('card-a')
  })

  it('disables and marks cards that already exist on the dashboard', () => {
    render(<AddCardBrowsePanel {...baseProps} existingCardTypes={['card-a']} />)

    expect(screen.getByText('Card A').closest('button')).toBeDisabled()
    expect(screen.getByText('dashboard.addCard.added')).toBeVisible()
  })

  it('does not render cards from a collapsed category', () => {
    render(<AddCardBrowsePanel {...baseProps} expandedCategories={new Set()} />)

    expect(screen.queryByText('Card A')).not.toBeInTheDocument()
  })

  it('calls openCardFactory when the create-custom button is clicked', () => {
    const openCardFactory = vi.fn()
    render(<AddCardBrowsePanel {...baseProps} openCardFactory={openCardFactory} />)

    fireEvent.click(screen.getByText('dashboard.addCard.createCustom'))

    expect(openCardFactory).toHaveBeenCalledTimes(1)
  })

  it('shows recommended cards section when recommendedCards are provided', () => {
    render(<AddCardBrowsePanel {...baseProps} recommendedCards={[cardA]} />)

    expect(screen.getByText('dashboard.addCard.recommended')).toBeVisible()
  })
})
