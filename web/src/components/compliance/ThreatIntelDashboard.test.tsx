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

import ThreatIntelDashboard from './ThreatIntelDashboard'

describe('ThreatIntelDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { authFetch } = require('../../lib/api')
    authFetch.mockImplementation((url: string) => {
      if (url.includes('/feeds')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 'feed-1',
              name: 'GitHub Advisory Feed',
              provider: 'GitHub',
              status: 'active',
              last_updated: '2026-01-01T00:00:00Z',
              indicators_count: 120,
              category: 'vulnerability',
            },
          ]),
        })
      }

      if (url.includes('/iocs')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 'ioc-1',
              ioc_type: 'domain',
              indicator: 'evil.example.com',
              feed_name: 'GitHub Advisory Feed',
              severity: 'high',
              matched_resource: 'payments-api',
              cluster: 'prod-east',
              detected_at: '2026-01-01T00:00:00Z',
              status: 'active',
            },
          ]),
        })
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          total_feeds: 2,
          active_feeds: 1,
          total_indicators: 120,
          total_matches: 12,
          active_matches: 1,
          risk_score: 62,
          critical_matches: 1,
          high_matches: 2,
          medium_matches: 4,
          low_matches: 5,
          top_ioc_types: [{ type: 'domain', count: 7 }],
          vulnerability_correlation: 45,
        }),
      })
    })
  })

  it('renders overview, feeds, and IOC matches', async () => {
    const user = userEvent.setup()

    render(<ThreatIntelDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Threat Intelligence')).toBeInTheDocument()
      expect(screen.getByText('Risk Score')).toBeInTheDocument()
      expect(screen.getByText('IOC Types')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Threat Feeds' }))
    expect(screen.getByText('GitHub Advisory Feed')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'IOC Matches' }))
    expect(screen.getByText('evil.example.com')).toBeInTheDocument()
    expect(screen.getByText('payments-api')).toBeInTheDocument()
  })
})
