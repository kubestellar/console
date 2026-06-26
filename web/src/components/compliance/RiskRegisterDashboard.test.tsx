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

import RiskRegisterDashboard from './RiskRegisterDashboard'

describe('RiskRegisterDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockedAuthFetch = vi.mocked(authFetch)
    mockedAuthFetch.mockImplementation((url: string) => {
      if (url.includes('/risks')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 'risk-1',
              name: 'Third-party dependency drift',
              description: 'A supplier ships an unexpected transitive dependency.',
              category: 'Technology',
              likelihood: 4,
              impact: 3,
              score: 12,
              owner: 'Platform Team',
              status: 'Open',
              last_review: '2026-01-01T00:00:00Z',
              next_review: '2026-02-01T00:00:00Z',
              mitigation_plan: 'Pin and verify dependencies.',
              controls: ['SBOM', 'Admission policy'],
              created_at: '2025-12-01T00:00:00Z',
            },
          ]),
        })
      }

      if (url.includes('/categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { category: 'Technology', count: 1, avg_score: 12, open: 1 },
          ]),
        })
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          total_risks: 1,
          open_risks: 1,
          overdue_reviews: 0,
          avg_risk_score: 12,
          evaluated_at: '2026-01-01T00:00:00Z',
        }),
      })
    })
  })

  it('renders risks and opens the detail panel', async () => {
    const user = userEvent.setup()

    render(<RiskRegisterDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Risk Register')).toBeInTheDocument()
      expect(screen.getByText('Third-party dependency drift')).toBeInTheDocument()
      expect(screen.getByTestId('unified-dashboard')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Third-party dependency drift'))
    expect(screen.getByText('Pin and verify dependencies.')).toBeInTheDocument()
    expect(screen.getByText('Admission policy')).toBeInTheDocument()
  })
})
