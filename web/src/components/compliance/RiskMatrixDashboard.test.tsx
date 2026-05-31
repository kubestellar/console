import { render, screen, waitFor } from '@testing-library/react'
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

import RiskMatrixDashboard from './RiskMatrixDashboard'

describe('RiskMatrixDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { authFetch } = require('../../lib/api')
    authFetch.mockImplementation((url: string) => {
      if (url.includes('/risks')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 'risk-1',
              name: 'Control plane outage',
              category: 'Operational',
              likelihood: 5,
              impact: 4,
              score: 20,
              owner: 'SRE',
              status: 'Open',
              last_review: '2026-01-01T00:00:00Z',
            },
          ]),
        })
      }

      if (url.includes('/heatmap')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { likelihood: 5, impact: 4, count: 1, risks: ['risk-1'] },
          ]),
        })
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          total_risks: 1,
          critical: 1,
          high: 0,
          medium: 0,
          low: 0,
          trend_direction: 'down',
          trend_percentage: 12,
          evaluated_at: '2026-01-01T00:00:00Z',
        }),
      })
    })
  })

  it('renders heat map content and unified dashboard', async () => {
    render(<RiskMatrixDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Risk Matrix')).toBeInTheDocument()
      expect(screen.getByText('Risk Heat Map')).toBeInTheDocument()
      expect(screen.getByText('Control plane outage')).toBeInTheDocument()
      expect(screen.getByTestId('unified-dashboard')).toBeInTheDocument()
    })

    expect(screen.getByText('All Risks')).toBeInTheDocument()
    expect(screen.getByText('19% improvement over 6 months')).toBeInTheDocument()
  })
})
