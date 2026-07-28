import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ManageCardsTab } from './cardFactoryManageTab'
import type { DynamicCardDefinition } from '../../lib/dynamic-cards/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}))

vi.mock('../shared/TechnicalAcronym', () => ({
  wrapAbbreviations: (text: string) => text,
}))

const makeCard = (overrides: Partial<DynamicCardDefinition> = {}): DynamicCardDefinition => ({
  id: 'card-1',
  title: 'My Card',
  tier: 'tier1',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
})

describe('ManageCardsTab', () => {
  it('shows empty state when there are no cards', () => {
    render(<ManageCardsTab existingCards={[]} onDeleteRequest={vi.fn()} />)
    expect(screen.getByText('dashboard.cardFactory.noCustomCards')).toBeInTheDocument()
    expect(screen.getByText('dashboard.cardFactory.useDeclarativeOrCode')).toBeInTheDocument()
  })

  it('renders a list of cards when cards exist', () => {
    const cards = [makeCard({ id: 'c1', title: 'Alpha' }), makeCard({ id: 'c2', title: 'Beta', tier: 'tier2' })]
    render(<ManageCardsTab existingCards={cards} onDeleteRequest={vi.fn()} />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('shows tier1 declarative badge for tier1 cards', () => {
    render(<ManageCardsTab existingCards={[makeCard({ tier: 'tier1' })]} onDeleteRequest={vi.fn()} />)
    expect(screen.getByText('dashboard.cardFactory.declarativeBadge')).toBeInTheDocument()
  })

  it('shows tier2 custom code badge for tier2 cards', () => {
    render(<ManageCardsTab existingCards={[makeCard({ tier: 'tier2' })]} onDeleteRequest={vi.fn()} />)
    expect(screen.getByText('dashboard.cardFactory.customCodeBadge')).toBeInTheDocument()
  })

  it('renders optional description when provided', () => {
    const card = makeCard({ description: 'A useful card' })
    render(<ManageCardsTab existingCards={[card]} onDeleteRequest={vi.fn()} />)
    expect(screen.getByText('A useful card')).toBeInTheDocument()
  })

  it('calls onDeleteRequest with the card id when delete button is clicked', () => {
    const onDeleteRequest = vi.fn()
    const card = makeCard({ id: 'card-abc' })
    render(<ManageCardsTab existingCards={[card]} onDeleteRequest={onDeleteRequest} />)
    fireEvent.click(screen.getByTitle('dashboard.cardFactory.deleteCard'))
    expect(onDeleteRequest).toHaveBeenCalledWith('card-abc')
  })
})
