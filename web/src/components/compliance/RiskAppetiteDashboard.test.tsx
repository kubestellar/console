import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ authFetch: vi.fn() }))
vi.mock('../../lib/unified/dashboard/UnifiedDashboard', () => ({
  UnifiedDashboard: () => <div data-testid="unified-dashboard" />,
}))
vi.mock('../shared/DashboardHeader', () => ({
  DashboardHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  ),
}))
vi.mock('../ui/RotatingTip', () => ({ RotatingTip: () => <div data-testid="rotating-tip" /> }))

import RiskAppetiteDashboard from './RiskAppetiteDashboard'

describe('RiskAppetiteDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { authFetch } = require('../../lib/api')
    authFetch.mockImplementation((url: string) => {
      if (url.includes('/categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 'cat-1',
              category: 'Operational Resilience',
              appetite: 'cautious',
              current_score: 62,
              threshold_green: 40,
              threshold_amber: 70,
              threshold_red: 100,
              owner: 'Risk Office',
              rationale: 'Minimize disruption to critical workloads.',
            },
          ]),
        })
      }

      if (url.includes('/kris')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 'kri-1',
              name: 'Unpatched critical vulns',
              category: 'Operational Resilience',
              value: 8,
              unit: '%',
              target: 2,
              warning: 5,
              critical: 10,
              trend: 'up',
              status: 'amber',
            },
          ]),
        })
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          total_categories: 5,
          within_appetite: 3,
          amber_warnings: 1,
          breaches: 1,
          total_kris: 7,
          kri_breaches: 2,
          evaluated_at: '2026-01-01T00:00:00Z',
        }),
      })
    })
  })

  it('renders categories, KRI details, and overview', async () => {
    const user = userEvent.setup()

    render(<RiskAppetiteDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Risk Appetite')).toBeInTheDocument()
      expect(screen.getByText('Operational Resilience')).toBeInTheDocument()
      expect(screen.getByTestId('unified-dashboard')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Key Risk Indicators' }))
    expect(screen.getByText('Unpatched critical vulns')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Overview' }))
    expect(screen.getByText('Status Overview')).toBeInTheDocument()
    expect(screen.getByText('Risk Posture Summary')).toBeInTheDocument()
  })
})
