import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StellarNotification } from '../../../types/stellar'
import { EventsPanelList, type EventsPanelListProps } from './EventsPanelList'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('../EventCard', () => ({
  EventCard: ({ notification, onDismiss }: { notification: StellarNotification; onDismiss: () => void }) => (
    <button onClick={onDismiss}>{notification.title}</button>
  ),
}))
vi.mock('../DigestCard', () => ({
  DigestCard: ({ onDismiss }: { onDismiss: () => void }) => <button onClick={onDismiss}>Dismiss digest</button>,
}))
vi.mock('../SolveCards', () => ({
  SolveProgressCard: () => <div>Active solve</div>,
  SolveEscalatedCard: () => <div>Escalated solve</div>,
}))

const event: StellarNotification = {
  id: 'event-1', type: 'event', severity: 'warning', title: 'Pod restart loop',
  body: 'Pod restarted', read: false, createdAt: '2026-10-20T19:00:00Z',
}
const digest: StellarNotification = { ...event, id: 'digest-1', type: 'digest', title: 'Daily digest' }

function props(overrides: Partial<EventsPanelListProps> = {}): EventsPanelListProps {
  return {
    notifications: [], solves: [], solveProgress: {}, digest: null, currentBatch: null,
    activeProgress: [], terminalSolves: [], hasAny: false,
    groups: { critical: [], warning: [], info: [] }, stellarResolved: [],
    acknowledgeNotification: vi.fn().mockResolvedValue(undefined),
    onOpenDetail: vi.fn(), onOpenBatchMonitor: vi.fn(),
    ...overrides,
  }
}

describe('EventsPanelList', () => {
  it('shows the empty state only when there is no event content', () => {
    render(<EventsPanelList {...props()} />)
    expect(screen.getByText('No events — all clear')).toBeInTheDocument()
  })

  it('routes batch clicks and dismisses grouped events by ID', () => {
    const acknowledgeNotification = vi.fn().mockResolvedValue(undefined)
    const onOpenBatchMonitor = vi.fn()
    render(<EventsPanelList {...props({
      notifications: [event], hasAny: true, groups: { critical: [], warning: [event], info: [] },
      currentBatch: { timestamp: 'batch-1', solvingCount: 1, totalEvents: 2 },
      acknowledgeNotification, onOpenBatchMonitor,
    })} />)

    expect(screen.getByText('High priority')).toBeInTheDocument()
    expect(screen.queryByText('No events — all clear')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /stellar\.batch\.processingBatch/ }))
    expect(onOpenBatchMonitor).toHaveBeenCalledWith('batch-1')
    fireEvent.click(screen.getByRole('button', { name: 'Pod restart loop' }))
    expect(acknowledgeNotification).toHaveBeenCalledWith('event-1')
  })

  it('dismisses the digest and shows Stellar-resolved events separately', () => {
    const acknowledgeNotification = vi.fn().mockResolvedValue(undefined)
    render(<EventsPanelList {...props({ digest, stellarResolved: [event], hasAny: true, acknowledgeNotification })} />)

    expect(screen.getByText(/Resolved by Stellar/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss digest' }))
    expect(acknowledgeNotification).toHaveBeenCalledWith('digest-1')
    fireEvent.click(screen.getByRole('button', { name: 'Pod restart loop' }))
    expect(acknowledgeNotification).toHaveBeenCalledWith('event-1')
  })
})
