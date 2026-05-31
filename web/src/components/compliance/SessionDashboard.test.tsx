import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? 'Retry' }),
}))
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

import SessionDashboard from './SessionDashboard'

describe('SessionDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { authFetch } = require('../../lib/api')
    authFetch.mockImplementation((url: string) => {
      if (url.includes('/summary')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            active_sessions: 5,
            unique_users: 4,
            avg_duration_minutes: 18,
            sessions_terminated_24h: 1,
            policy_violations: 2,
            mfa_sessions_pct: 95,
            evaluated_at: '2026-01-01T00:00:00Z',
          }),
        })
      }

      if (url.includes('/active')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 'session-1',
              user: 'alice',
              login_time: '2026-01-01T00:00:00Z',
              last_activity: '2026-01-01T00:10:00Z',
              ip_address: '10.0.0.8',
              user_agent: 'Chrome',
              provider: 'Azure AD',
              status: 'active',
              expires_at: '2026-01-01T08:00:00Z',
            },
          ]),
        })
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([
          {
            id: 'policy-1',
            name: 'Default workforce policy',
            description: 'Applies to all workforce users.',
            idle_timeout_minutes: 15,
            absolute_timeout_hours: 8,
            max_concurrent: 2,
            enforce_mfa: true,
            scope: 'global',
          },
        ]),
      })
    })
  })

  it('renders sessions, policies, and unified dashboard', async () => {
    const user = userEvent.setup()

    render(<SessionDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Session Management')).toBeInTheDocument()
      expect(screen.getByText('alice')).toBeInTheDocument()
      expect(screen.getByTestId('unified-dashboard')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Policies' }))
    expect(screen.getByText('Default workforce policy')).toBeInTheDocument()
    expect(screen.getByText('global')).toBeInTheDocument()
  })
})
