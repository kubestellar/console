import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authFetch } from '../../lib/api'

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
    const mockedAuthFetch = vi.mocked(authFetch)
    mockedAuthFetch.mockImplementation((url: string) => {
      if (url.includes('/thresholds')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              category: 'Operational Resilience',
              appetite_level: 5,
              actual_exposure: 8,
              tolerance_max: 10,
              status: 'amber',
              statement: 'Minimize disruption to critical workloads.',
              trend_quarters: [4, 5, 6, 8],
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
              threshold: 5,
              actual: 8,
              unit: '%',
              status: 'amber',
              last_updated: '2026-01-01T00:00:00Z',
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

  it('renders thresholds, KRI details, and quarterly trends', async () => {
    const user = userEvent.setup()

    render(<RiskAppetiteDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Risk Appetite')).toBeInTheDocument()
      expect(screen.getByText('Operational Resilience')).toBeInTheDocument()
      expect(screen.getByText('Minimize disruption to critical workloads.')).toBeInTheDocument()
      expect(screen.getByTestId('unified-dashboard')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Key Risk Indicators' }))
    expect(screen.getByText('Unpatched critical vulns')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Quarterly Trends' }))
    expect(screen.getByText('Appetite vs actual exposure over the last 4 quarters')).toBeInTheDocument()
    expect(screen.getByText('Current: 8')).toBeInTheDocument()
  })
})
