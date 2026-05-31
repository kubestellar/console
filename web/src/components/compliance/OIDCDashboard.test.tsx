import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCache } from '../../lib/cache'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? 'Retry' }),
}))
vi.mock('../../lib/api', () => ({ authFetch: vi.fn(), safeJson: vi.fn() }))
vi.mock('../../lib/cache', () => ({ useCache: vi.fn() }))
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

import OIDCDashboard from './OIDCDashboard'

describe('OIDCDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockedUseCache = vi.mocked(useCache)
    mockedUseCache.mockImplementation(({ key }: { key: string }) => {
      if (key === 'identity-oidc-summary') {
        return {
          data: {
            total_providers: 3,
            active_providers: 2,
            total_users: 124,
            active_sessions: 18,
            failed_logins_24h: 4,
            mfa_adoption: 92,
            evaluated_at: '2026-01-01T00:00:00Z',
          },
          error: null,
          isLoading: false,
          isRefreshing: false,
          refetch: vi.fn(),
        }
      }

      if (key === 'identity-oidc-providers') {
        return {
          data: [
            {
              id: 'provider-1',
              name: 'Azure AD',
              issuer_url: 'https://login.example.com',
              status: 'connected',
              protocol: 'OIDC',
              client_id: 'portal',
              users_synced: 88,
              last_sync: '2026-01-01T00:00:00Z',
              groups_mapped: 12,
            },
          ],
          error: null,
          isLoading: false,
          isRefreshing: false,
          refetch: vi.fn(),
        }
      }

      return {
        data: [
          {
            id: 'session-1',
            user: 'alice',
            provider_id: 'provider-1',
            provider_name: 'Azure AD',
            login_time: '2026-01-01T00:00:00Z',
            expires_at: '2026-01-01T08:00:00Z',
            ip_address: '10.0.0.5',
            active: true,
          },
        ],
        error: null,
        isLoading: false,
        isRefreshing: false,
        refetch: vi.fn(),
      }
    })
  })

  it('renders provider data, sessions, and unified dashboard', async () => {
    const user = userEvent.setup()

    render(<OIDCDashboard />)

    expect(screen.getByText('OIDC Federation')).toBeInTheDocument()
    expect(screen.getByText('Azure AD')).toBeInTheDocument()
    expect(screen.getByText('124')).toBeInTheDocument()
    expect(screen.getByTestId('unified-dashboard')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Active Sessions' }))
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('10.0.0.5')).toBeInTheDocument()
  })
})
