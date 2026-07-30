import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { SnoozedSwap } from '../../../hooks/useSnoozedCards'

const mockFormatTimeRemaining = vi.fn()

vi.mock('../../../hooks/useSnoozedCards', () => ({
  formatTimeRemaining: (value: number) => mockFormatTimeRemaining(value),
}))

import { SnoozedItem } from '../SnoozedItem'

const baseSwap: SnoozedSwap = {
  id: 'swap-1',
  originalCardId: 'cpu',
  originalCardType: 'cpu',
  originalCardTitle: 'CPU Usage',
  newCardType: 'memory',
  newCardTitle: 'Memory Usage',
  reason: 'Higher signal during incidents',
  snoozedAt: 100,
  snoozedUntil: 200,
}

describe('SnoozedItem', () => {
  beforeEach(() => {
    mockFormatTimeRemaining.mockReturnValue('15m')
  })

  it('renders the replacement card details and remaining time', () => {
    render(<SnoozedItem swap={baseSwap} onApply={vi.fn()} onDismiss={vi.fn()} />)

    expect(screen.getByText('CPU Usage')).toBeInTheDocument()
    expect(screen.getByText('Memory Usage')).toBeInTheDocument()
    expect(screen.getByText('15m')).toBeInTheDocument()
  })

  it('shows an apply action immediately when the snooze has expired', () => {
    mockFormatTimeRemaining.mockReturnValue('Expired')

    render(<SnoozedItem swap={baseSwap} onApply={vi.fn()} onDismiss={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'actions.apply' })).toBeInTheDocument()
    expect(screen.getByText('sidebar.readyToSwap')).toBeInTheDocument()
  })

  it('reveals the reason and apply action on hover for active snoozes', () => {
    const { container } = render(<SnoozedItem swap={baseSwap} onApply={vi.fn()} onDismiss={vi.fn()} />)

    fireEvent.mouseEnter(container.firstElementChild as HTMLElement)

    expect(screen.getByRole('button', { name: 'actions.apply' })).toBeInTheDocument()
    expect(screen.getByText('Higher signal during incidents')).toBeInTheDocument()
  })
})
