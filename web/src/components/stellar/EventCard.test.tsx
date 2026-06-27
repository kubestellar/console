import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EventCard } from './EventCard'
import type { StellarNotification } from '../../types/stellar'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('./lib/derive', () => ({
  countRelated: () => 0,
  deriveImportance: () => ({ label: 'medium', score: 50 }),
  deriveShortReason: () => 'Pod CrashLoopBackOff',
  deriveTags: () => ['pod'],
  importanceColor: () => 'var(--s-warning)',
  countSolveAttempts: () => 0,
  getSolveStatus: () => null,
}))

vi.mock('./lib/time', () => ({
  formatRelativeTime: () => '5m ago',
}))

const baseNotification: StellarNotification = {
  id: 'evt-1',
  type: 'event',
  severity: 'warning',
  title: 'Pod CrashLoopBackOff',
  body: 'Pod my-app-xyz is crashing repeatedly',
  cluster: 'prod-cluster',
  namespace: 'default',
  read: false,
  createdAt: new Date().toISOString(),
}

describe('EventCard', () => {
  it('renders the notification title', () => {
    render(
      <EventCard
        notification={baseNotification}
        onDismiss={() => {}}
      />
    )
    expect(screen.getByText('Pod CrashLoopBackOff')).toBeInTheDocument()
  })

  it('renders with reduced opacity when read', () => {
    const readNotification = { ...baseNotification, read: true }
    const { container } = render(
      <EventCard
        notification={readNotification}
        onDismiss={() => {}}
      />
    )
    const card = container.firstChild as HTMLElement
    expect(card.style.opacity).toBe('0.45')
  })

  it('calls onOpenDetail when clicked', () => {
    const onOpenDetail = vi.fn()
    render(
      <EventCard
        notification={baseNotification}
        onDismiss={() => {}}
        onOpenDetail={onOpenDetail}
      />
    )
    fireEvent.click(screen.getByLabelText('Open details for Pod CrashLoopBackOff'))
    expect(onOpenDetail).toHaveBeenCalledWith(baseNotification)
  })

  it('calls onOpenDetail on Enter key', () => {
    const onOpenDetail = vi.fn()
    render(
      <EventCard
        notification={baseNotification}
        onDismiss={() => {}}
        onOpenDetail={onOpenDetail}
      />
    )
    fireEvent.keyDown(screen.getByLabelText('Open details for Pod CrashLoopBackOff'), { key: 'Enter' })
    expect(onOpenDetail).toHaveBeenCalledWith(baseNotification)
  })

  it('renders solve status badge when provided', () => {
    render(
      <EventCard
        notification={{ ...baseNotification, status: 'investigating' }}
        solveStatus={{ step: 'investigating', message: 'Checking pods' }}
        onDismiss={() => {}}
      />
    )
    expect(screen.getByText('Investigating')).toBeInTheDocument()
  })

  it('renders resolved status', () => {
    render(
      <EventCard
        notification={{ ...baseNotification, status: 'resolved' }}
        onDismiss={() => {}}
      />
    )
    expect(screen.getByText('Resolved')).toBeInTheDocument()
  })

  it('renders dismissed status', () => {
    render(
      <EventCard
        notification={{ ...baseNotification, status: 'dismissed' }}
        onDismiss={() => {}}
      />
    )
    expect(screen.getByText('Removed')).toBeInTheDocument()
  })

  it('shows attempt count when provided', () => {
    render(
      <EventCard
        notification={baseNotification}
        attemptCount={3}
        onDismiss={() => {}}
      />
    )
    // The t() mock returns the key as-is; assert the full i18n key to avoid false positives
    expect(screen.getByText("stellar.eventCard.attemptCount")).toBeInTheDocument()
  })
})
