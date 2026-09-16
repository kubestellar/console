import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EventCardHeader } from './EventCardHeader'
import type { StellarNotification } from '../../../types/stellar'

const baseNotification: StellarNotification = {
  id: 'evt-1',
  type: 'event',
  severity: 'warning',
  title: 'Pod CrashLoopBackOff',
  body: 'pod is crashing',
  read: false,
  createdAt: new Date().toISOString(),
}

describe('EventCardHeader', () => {
  it('renders the notification title', () => {
    render(
      <EventCardHeader
        notification={baseNotification}
        importance={{ label: 'High', score: 80 }}
        importanceCol="#ff0000"
        statusBadge={null}
        relativeCreatedAt="2m ago"
      />
    )
    expect(screen.getByText('Pod CrashLoopBackOff')).toBeVisible()
  })

  it('shows the importance badge for unread notifications', () => {
    render(
      <EventCardHeader
        notification={baseNotification}
        importance={{ label: 'High', score: 80 }}
        importanceCol="#ff0000"
        statusBadge={null}
        relativeCreatedAt="2m ago"
      />
    )
    expect(screen.getByText('High')).toBeVisible()
  })

  it('hides the importance badge once the notification is read', () => {
    render(
      <EventCardHeader
        notification={{ ...baseNotification, read: true }}
        importance={{ label: 'High', score: 80 }}
        importanceCol="#ff0000"
        statusBadge={null}
        relativeCreatedAt="2m ago"
      />
    )
    expect(screen.queryByText('High')).not.toBeInTheDocument()
  })

  it('renders a status badge when provided', () => {
    render(
      <EventCardHeader
        notification={baseNotification}
        importance={{ label: 'High', score: 80 }}
        importanceCol="#ff0000"
        statusBadge={{ label: 'Escalated', color: '#f00' }}
        relativeCreatedAt="2m ago"
      />
    )
    expect(screen.getByText('Escalated')).toBeVisible()
  })

  it('renders the relative created-at timestamp', () => {
    render(
      <EventCardHeader
        notification={baseNotification}
        importance={{ label: 'High', score: 80 }}
        importanceCol="#ff0000"
        statusBadge={null}
        relativeCreatedAt="5m ago"
      />
    )
    expect(screen.getByText('5m ago')).toBeVisible()
  })

  it('shows the details affordance only when onOpenDetail is provided', () => {
    const { rerender } = render(
      <EventCardHeader
        notification={baseNotification}
        importance={{ label: 'High', score: 80 }}
        importanceCol="#ff0000"
        statusBadge={null}
        relativeCreatedAt="2m ago"
      />
    )
    expect(screen.queryByText('stellar.eventCard.details')).not.toBeInTheDocument()

    rerender(
      <EventCardHeader
        notification={baseNotification}
        importance={{ label: 'High', score: 80 }}
        importanceCol="#ff0000"
        statusBadge={null}
        relativeCreatedAt="2m ago"
        onOpenDetail={vi.fn()}
      />
    )
    expect(screen.getByText('stellar.eventCard.details')).toBeVisible()
  })
})
