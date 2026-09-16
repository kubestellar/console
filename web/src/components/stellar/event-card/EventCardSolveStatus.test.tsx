import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EventCardSolveStatus, EventCardMonitoringBadge } from './EventCardSolveStatus'
import type { SolveStatus } from '../lib/derive'
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

describe('EventCardSolveStatus', () => {
  it('renders the phase label and percent', () => {
    const solveStatus: SolveStatus = {
      label: '🔍 Investigating',
      color: '#0af',
      isActive: true,
      percent: 42,
      phase: 'investigating',
    }
    render(<EventCardSolveStatus solveStatus={solveStatus} />)

    expect(screen.getByText('🔍 Investigating')).toBeVisible()
    expect(screen.getByText('42%')).toBeVisible()
  })

  it('clamps the progress bar width between 0 and 100', () => {
    const solveStatus: SolveStatus = {
      label: 'Resolving',
      color: '#0f0',
      isActive: false,
      percent: 150,
      phase: 'resolved',
    }
    const { container } = render(<EventCardSolveStatus solveStatus={solveStatus} />)
    const bar = container.querySelector('[style*="ease"]') as HTMLElement
    expect(bar.style.width).toBe('100%')
  })

  it('shows a countdown badge only when resolved_monitored with a nextRecheckAt', () => {
    const solveStatus: SolveStatus = {
      label: 'Monitoring',
      color: '#0af',
      isActive: false,
      percent: 100,
      phase: 'resolved_monitored',
      nextRecheckAt: Date.now() + 65_000,
    }
    render(<EventCardSolveStatus solveStatus={solveStatus} />)
    expect(screen.getByText(/^1m \d+s$/)).toBeVisible()
  })
})

describe('EventCardMonitoringBadge', () => {
  it('shows the monitoring target when provided', () => {
    const solveStatus: SolveStatus = {
      label: 'Monitoring',
      color: '#0af',
      isActive: false,
      percent: 100,
      phase: 'resolved_monitored',
      monitoringTarget: 'my-namespace',
    }
    render(<EventCardMonitoringBadge solveStatus={solveStatus} notification={baseNotification} />)

    expect(screen.getByText('stellar.eventCard.monitoring')).toBeVisible()
    expect(screen.getByText('my-namespace')).toBeVisible()
  })

  it('falls back to the notification namespace when no monitoring target is set', () => {
    const solveStatus: SolveStatus = {
      label: 'Monitoring',
      color: '#0af',
      isActive: false,
      percent: 100,
      phase: 'resolved_monitored',
    }
    render(
      <EventCardMonitoringBadge
        solveStatus={solveStatus}
        notification={{ ...baseNotification, namespace: 'fallback-ns' }}
      />
    )
    expect(screen.getByText('fallback-ns')).toBeVisible()
  })

  it('shows the recheck-now label when nextRecheckAt is in the past', () => {
    const solveStatus: SolveStatus = {
      label: 'Monitoring',
      color: '#0af',
      isActive: false,
      percent: 100,
      phase: 'resolved_monitored',
      nextRecheckAt: Date.now() - 1000,
    }
    render(<EventCardMonitoringBadge solveStatus={solveStatus} notification={baseNotification} />)
    expect(screen.getByText('stellar.eventCard.recheckNow')).toBeVisible()
  })
})
