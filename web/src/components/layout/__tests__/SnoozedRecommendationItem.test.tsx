import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { SnoozedRecommendation } from '../../../hooks/useSnoozedRecommendations'

const mockFormatElapsedTime = vi.fn()

vi.mock('../../../hooks/useSnoozedRecommendations', () => ({
  formatElapsedTime: (value: number) => mockFormatElapsedTime(value),
}))

import { SnoozedRecommendationItem } from '../SnoozedRecommendationItem'

const recommendation: SnoozedRecommendation = {
  id: 'recommendation-1',
  snoozedAt: 100,
  expiresAt: 1_000,
  recommendation: {
    id: 'card-rec-1',
    cardType: 'alerts',
    title: 'Surface namespace alerts',
    reason: 'High-signal operational data',
    priority: 'high',
  },
}

describe('SnoozedRecommendationItem', () => {
  beforeEach(() => {
    mockFormatElapsedTime.mockReturnValue('2h')
  })

  it('renders the recommendation title and elapsed time', () => {
    render(<SnoozedRecommendationItem rec={recommendation} onApply={vi.fn()} onDismiss={vi.fn()} />)

    expect(screen.getByText('Surface namespace alerts')).toBeInTheDocument()
    expect(screen.getByText('2h')).toBeInTheDocument()
  })

  it('reveals the restore action and reason on hover', () => {
    const { container } = render(<SnoozedRecommendationItem rec={recommendation} onApply={vi.fn()} onDismiss={vi.fn()} />)

    fireEvent.mouseEnter(container.firstElementChild as HTMLElement)

    expect(screen.getByRole('button', { name: 'actions.restore' })).toBeInTheDocument()
    expect(screen.getByText('High-signal operational data')).toBeInTheDocument()
  })

  it('dismisses the recommendation when the close button is clicked', () => {
    const onDismiss = vi.fn()

    render(<SnoozedRecommendationItem rec={recommendation} onApply={vi.fn()} onDismiss={onDismiss} />)

    fireEvent.click(screen.getAllByRole('button')[0])

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
