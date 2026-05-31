import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ authFetch: vi.fn() }))
vi.mock('../shared/DashboardHeader', () => ({
  DashboardHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  ),
}))
vi.mock('../ui/RotatingTip', () => ({ RotatingTip: () => <div data-testid="rotating-tip" /> }))

import SIEMDashboard from './SIEMDashboard'

describe('SIEMDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { authFetch } = require('../../lib/api')
    authFetch.mockImplementation((url: string) => {
      if (url.includes('/events')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 'event-1',
              timestamp: '2026-01-01T00:00:00Z',
              source: 'falco',
              severity: 'high',
              category: 'Runtime',
              message: 'Container spawned a shell',
              cluster: 'prod-east',
            },
          ]),
        })
      }

      if (url.includes('/alerts')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 'alert-1',
              name: 'Credential exfiltration detected',
              severity: 'critical',
              status: 'active',
              source: 'falco',
              triggered_at: '2026-01-01T00:00:00Z',
              correlated_events: 5,
            },
          ]),
        })
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          total_events: 2000,
          events_last_24h: 1500,
          total_alerts: 8,
          active_alerts: 3,
          critical_alerts: 1,
          high_alerts: 2,
          medium_alerts: 3,
          low_alerts: 2,
          top_sources: [{ source: 'falco', count: 750 }],
          ingestion_rate: 24,
        }),
      })
    })
  })

  it('renders overview, events, and alerts tabs', async () => {
    const user = userEvent.setup()

    render(<SIEMDashboard />)

    await waitFor(() => {
      expect(screen.getByText('SIEM Integration')).toBeInTheDocument()
      expect(screen.getByText('Severity Distribution')).toBeInTheDocument()
      expect(screen.getByText('Top Event Sources')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Event Timeline' }))
    expect(screen.getByText('Container spawned a shell')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Alert Correlation' }))
    expect(screen.getByText('Credential exfiltration detected')).toBeInTheDocument()
  })
})
