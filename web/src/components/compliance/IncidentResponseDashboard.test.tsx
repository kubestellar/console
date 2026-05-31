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

import IncidentResponseDashboard from './IncidentResponseDashboard'

describe('IncidentResponseDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { authFetch } = require('../../lib/api')
    authFetch.mockImplementation((url: string) => {
      if (url.includes('/metrics')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            total_incidents: 4,
            active_incidents: 2,
            resolved_last_30d: 9,
            mttr_hours: 5,
            mttr_trend: 'improving',
            escalation_rate: 25,
            by_severity: { critical: 1, high: 1, medium: 1, low: 1 },
            by_status: { open: 1, investigating: 1, mitigating: 1, resolved: 1, closed: 0 },
          }),
        })
      }

      if (url.includes('/playbooks')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 'pb-1',
              name: 'Contain lateral movement',
              description: 'Quarantine impacted workloads.',
              last_executed: '2026-01-01T00:00:00Z',
              execution_count: 12,
              avg_resolution_min: 18,
              status: 'active',
              steps: 6,
            },
          ]),
        })
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([
          {
            id: 'INC-1',
            title: 'Suspicious token replay',
            severity: 'critical',
            status: 'investigating',
            assignee: 'Alex',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T01:00:00Z',
            escalation_level: 2,
            cluster: 'prod-east',
            playbook_id: 'pb-1',
          },
        ]),
      })
    })
  })

  it('renders incident summary and switches between tabs', async () => {
    const user = userEvent.setup()

    render(<IncidentResponseDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Incident Response')).toBeInTheDocument()
      expect(screen.getByText('Suspicious token replay')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Playbooks' }))
    expect(screen.getByText('Contain lateral movement')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'MTTR Metrics' }))
    expect(screen.getByText('Incidents by Severity')).toBeInTheDocument()
    expect(screen.getByText('Mean Time to Resolution')).toBeInTheDocument()
  })
})
