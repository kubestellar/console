import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { SnoozedMission } from '../../../hooks/useSnoozedMissions'

const mockFormatTimeRemaining = vi.fn()

vi.mock('../../../hooks/useSnoozedMissions', () => ({
  formatTimeRemaining: (value: number) => mockFormatTimeRemaining(value),
}))

import { SnoozedMissionItem } from '../SnoozedMissionItem'

const now = Date.now()
const mission: SnoozedMission = {
  id: 'mission-1',
  snoozedAt: now - 1_000,
  expiresAt: now + 10_000,
  suggestion: {
    id: 'suggestion-1',
    type: 'restart',
    title: 'Restart unhealthy pods',
    description: 'Investigate crash loops in the payments namespace',
    priority: 'critical',
    action: {
      type: 'ai',
      target: 'diagnose',
      label: 'Diagnose',
    },
    context: {},
    detectedAt: now,
  },
}

describe('SnoozedMissionItem', () => {
  beforeEach(() => {
    mockFormatTimeRemaining.mockReturnValue('10m')
  })

  it('renders mission details and remaining time for active snoozes', () => {
    render(<SnoozedMissionItem mission={mission} onApply={vi.fn()} onDismiss={vi.fn()} />)

    expect(screen.getByText('Restart unhealthy pods')).toBeInTheDocument()
    expect(screen.getByText('10m')).toBeInTheDocument()
  })

  it('shows the restore action immediately for expired missions', () => {
    render(
      <SnoozedMissionItem
        mission={{ ...mission, expiresAt: now - 1 }}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'actions.restore' })).toBeInTheDocument()
    expect(screen.getByText('sidebar.ready')).toBeInTheDocument()
  })

  it('reveals the mission description on hover for active snoozes', () => {
    const { container } = render(<SnoozedMissionItem mission={mission} onApply={vi.fn()} onDismiss={vi.fn()} />)

    fireEvent.mouseEnter(container.firstElementChild as HTMLElement)

    expect(screen.getByText('Investigate crash loops in the payments namespace')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'actions.restore' })).toBeInTheDocument()
  })

  it('dismiss button has accessible title attribute', () => {
    render(<SnoozedMissionItem mission={mission} onApply={vi.fn()} onDismiss={vi.fn()} />)

    expect(screen.getByTitle('actions.dismiss')).toHaveAttribute('title', 'actions.dismiss')
  })

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn()

    render(<SnoozedMissionItem mission={mission} onApply={vi.fn()} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByTitle('actions.dismiss'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
