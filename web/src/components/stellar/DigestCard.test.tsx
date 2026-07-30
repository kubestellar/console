import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DigestCard } from './DigestCard'
import type { StellarNotification, StellarSolve } from '../../types/stellar'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const digestNotification: StellarNotification = {
  id: 'digest-1',
  type: 'system',
  severity: 'info',
  title: 'Daily Digest',
  body: '3 issues auto-fixed overnight.',
  read: false,
  createdAt: new Date().toISOString(),
}

const now = Date.now()

const solves: StellarSolve[] = [
  {
    id: 'solve-1',
    eventId: 'evt-1',
    userId: 'user-1',
    cluster: 'prod',
    namespace: 'default',
    workload: 'api-server',
    status: 'resolved',
    actionsTaken: 2,
    summary: 'Pod restarted successfully',
    startedAt: new Date(now - 3600_000).toISOString(),
  },
  {
    id: 'solve-2',
    eventId: 'evt-2',
    userId: 'user-1',
    cluster: 'prod',
    namespace: 'payments',
    workload: 'worker',
    status: 'escalated',
    actionsTaken: 5,
    summary: 'Could not recover',
    startedAt: new Date(now - 1800_000).toISOString(),
  },
]

describe('DigestCard', () => {
  it('renders the notification body', () => {
    render(
      <DigestCard
        notification={digestNotification}
        solves={solves}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.getByText('3 issues auto-fixed overnight.')).toBeInTheDocument()
  })

  it('renders the daily recap label', () => {
    render(
      <DigestCard
        notification={digestNotification}
        solves={solves}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.getByText('stellar.digest.dailyRecap')).toBeInTheDocument()
  })

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    render(
      <DigestCard
        notification={digestNotification}
        solves={solves}
        onDismiss={onDismiss}
      />
    )
    fireEvent.click(screen.getByTitle('actions.dismiss'))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('expands to show solve groups when expand button is clicked', () => {
    render(
      <DigestCard
        notification={digestNotification}
        solves={solves}
        onDismiss={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('▶'))
    expect(screen.getByText('▼')).toBeInTheDocument()
    // Resolved group should be visible
    expect(screen.getByText('stellar.digest.autoFixed (1)')).toBeInTheDocument()
    // Escalated group should be visible
    expect(screen.getByText('stellar.digest.escalated (1)')).toBeInTheDocument()
  })

  it('collapses when expand button is clicked again', () => {
    render(
      <DigestCard
        notification={digestNotification}
        solves={solves}
        onDismiss={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('▶'))
    fireEvent.click(screen.getByText('▼'))
    expect(screen.getByText('▶')).toBeInTheDocument()
  })

  it('calls onOpenEvent when a solve item is clicked in expanded view', () => {
    const onOpenEvent = vi.fn()
    render(
      <DigestCard
        notification={digestNotification}
        solves={solves}
        onDismiss={vi.fn()}
        onOpenEvent={onOpenEvent}
      />
    )
    fireEvent.click(screen.getByText('▶'))
    fireEvent.click(screen.getByText('api-server'))
    expect(onOpenEvent).toHaveBeenCalledWith('evt-1')
  })

  it('renders with empty solves list', () => {
    render(
      <DigestCard
        notification={digestNotification}
        solves={[]}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.getByText('3 issues auto-fixed overnight.')).toBeInTheDocument()
  })
})
