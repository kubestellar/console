import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EventsPanel } from './EventsPanel'
import type { StellarNotification } from '../../types/stellar'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('./lib/derive', () => ({
  countRelated: () => 0,
  deriveImportance: () => ({ label: 'medium', score: 50 }),
  deriveShortReason: () => 'Reason',
  deriveTags: () => [],
  importanceColor: () => 'var(--s-warning)',
  countSolveAttempts: () => 0,
  getSolveStatus: () => null,
}))

vi.mock('./lib/time', () => ({
  formatRelativeTime: () => '2m ago',
}))

vi.mock('./EventModal', () => ({
  EventModal: () => null,
}))

vi.mock('./DigestCard', () => ({
  DigestCard: () => <div data-testid="digest-card" />,
}))

vi.mock('./SolveCards', () => ({
  SolveProgressCard: () => <div data-testid="solve-progress" />,
  SolveEscalatedCard: () => <div data-testid="solve-escalated" />,
}))

vi.mock('./BatchMonitorModal', () => ({
  BatchMonitorModal: () => <div data-testid="batch-modal" />,
}))

vi.mock('./ApprovalCard', () => ({
  ApprovalCard: () => <div data-testid="approval-card" />,
}))

const mockNotifications: StellarNotification[] = [
  {
    id: 'crit-1',
    type: 'event',
    severity: 'critical',
    title: 'Node pressure detected',
    body: 'Memory pressure on worker-3',
    read: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'warn-1',
    type: 'event',
    severity: 'warning',
    title: 'Pod restart loop',
    body: 'Pod api-server is restarting',
    read: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'info-1',
    type: 'event',
    severity: 'info',
    title: 'Deployment scaled',
    body: 'Scaled from 2 to 4 replicas',
    read: false,
    createdAt: new Date().toISOString(),
  },
]

describe('EventsPanel', () => {
  const defaultProps = {
    notifications: mockNotifications,
    pendingActions: [],
    acknowledgeNotification: vi.fn().mockResolvedValue(undefined),
    dismissAllNotifications: vi.fn().mockResolvedValue(undefined),
    approveAction: vi.fn().mockResolvedValue(undefined),
    rejectAction: vi.fn().mockResolvedValue(undefined),
  }

  it('renders without crashing', () => {
    const { container } = render(<EventsPanel {...defaultProps} />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders event cards for notifications', () => {
    render(<EventsPanel {...defaultProps} />)
    expect(screen.getByText('Node pressure detected')).toBeInTheDocument()
    expect(screen.getByText('Pod restart loop')).toBeInTheDocument()
    expect(screen.getByText('Deployment scaled')).toBeInTheDocument()
  })

  it('renders empty state when no notifications', () => {
    render(<EventsPanel {...defaultProps} notifications={[]} />)
    // Should render the panel without crashing even with no events
    expect(screen.queryByText('Node pressure detected')).not.toBeInTheDocument()
  })

  it('renders with solve progress active', () => {
    render(
      <EventsPanel
        {...defaultProps}
        solves={[]}
        solveProgress={{
          'crit-1': {
            solveId: 'solve-1',
            eventId: 'crit-1',
            step: 'investigating',
            message: 'Reading pod logs',
          },
        }}
      />
    )
    expect(screen.getByTestId('solve-progress')).toBeInTheDocument()
  })

  it('renders escalated solves', () => {
    render(
      <EventsPanel
        {...defaultProps}
        solves={[
          {
            id: 'solve-1',
            eventId: 'crit-1',
            userId: 'user-1',
            cluster: 'prod',
            namespace: 'default',
            workload: 'api-server',
            status: 'escalated',
            actionsTaken: 3,
            summary: 'Unable to resolve, needs human intervention',
            startedAt: new Date().toISOString(),
          },
        ]}
      />
    )
    expect(screen.getByTestId('solve-escalated')).toBeInTheDocument()
  })

  it('renders digest notification pinned at top', () => {
    const notificationsWithDigest: StellarNotification[] = [
      ...mockNotifications,
      {
        id: 'digest-1',
        type: 'digest',
        severity: 'info',
        title: 'Daily digest',
        body: 'Summary of events',
        read: false,
        createdAt: new Date().toISOString(),
      },
    ]
    render(<EventsPanel {...defaultProps} notifications={notificationsWithDigest} />)
    expect(screen.getByTestId('digest-card')).toBeInTheDocument()
  })
})
