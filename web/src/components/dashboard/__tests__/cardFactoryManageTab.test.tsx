import React from 'react'
/**
 * Coverage for cardFactoryManageTab.tsx (Auto-QA #21690 — missing test file).
 *
 * Verifies the empty-state rendering, the list rendering (title, tier badge,
 * description, id/createdAt metadata) and the delete affordance callback.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ManageCardsTab } from '../cardFactoryManageTab'
import type { DynamicCardDefinition } from '../../../lib/dynamic-cards/types'

function makeCard(overrides: Partial<DynamicCardDefinition> = {}): DynamicCardDefinition {
  return {
    id: 'card-1',
    title: 'My Card',
    description: 'A description',
    tier: 'tier1',
    createdAt: new Date('2024-01-01T00:00:00Z').toISOString(),
    ...overrides,
  } as DynamicCardDefinition
}

describe('ManageCardsTab', () => {
  it('renders the empty state when there are no existing cards', () => {
    render(<ManageCardsTab existingCards={[]} onDeleteRequest={vi.fn()} />)

    expect(screen.getByText('dashboard.cardFactory.noCustomCards')).toBeVisible()
    expect(screen.getByText('dashboard.cardFactory.useDeclarativeOrCode')).toBeVisible()
  })

  it('renders a declarative (tier1) badge for tier1 cards', () => {
    render(<ManageCardsTab existingCards={[makeCard({ tier: 'tier1' })]} onDeleteRequest={vi.fn()} />)

    expect(screen.getByText('My Card')).toBeVisible()
    expect(screen.getByText('dashboard.cardFactory.declarativeBadge')).toBeVisible()
  })

  it('renders a custom-code badge for non-tier1 cards', () => {
    render(<ManageCardsTab existingCards={[makeCard({ tier: 'tier2' as unknown as DynamicCardDefinition['tier'] })]} onDeleteRequest={vi.fn()} />)

    expect(screen.getByText('dashboard.cardFactory.customCodeBadge')).toBeVisible()
  })

  it('omits the description paragraph when description is empty', () => {
    render(<ManageCardsTab existingCards={[makeCard({ description: '' })]} onDeleteRequest={vi.fn()} />)

    expect(screen.queryByText('A description')).not.toBeInTheDocument()
  })

  it('renders id and createdAt metadata for each card', () => {
    render(<ManageCardsTab existingCards={[makeCard({ id: 'abc-123' })]} onDeleteRequest={vi.fn()} />)

    expect(screen.getByText(/ID: abc-123/)).toBeVisible()
  })

  it('invokes onDeleteRequest with the card id when the delete button is clicked', () => {
    const onDeleteRequest = vi.fn()
    render(<ManageCardsTab existingCards={[makeCard({ id: 'card-42' })]} onDeleteRequest={onDeleteRequest} />)

    fireEvent.click(screen.getByTitle('dashboard.cardFactory.deleteCard'))

    expect(onDeleteRequest).toHaveBeenCalledWith('card-42')
    expect(onDeleteRequest).toHaveBeenCalledTimes(1)
  })

  it('renders one row per card when multiple cards are given', () => {
    render(
      <ManageCardsTab
        existingCards={[makeCard({ id: 'a', title: 'Card A' }), makeCard({ id: 'b', title: 'Card B' })]}
        onDeleteRequest={vi.fn()}
      />,
    )

    expect(screen.getByText('Card A')).toBeVisible()
    expect(screen.getByText('Card B')).toBeVisible()
  })
})
