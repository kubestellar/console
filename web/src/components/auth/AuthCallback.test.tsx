import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => { },
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
}))
vi.mock('../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true, useDemoMode: () => true, isDemoModeForced: false,
}))
vi.mock('../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
}))
vi.mock('../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    setToken: vi.fn(),
    refreshUser: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('../../hooks/useLastRoute', () => ({
  getLastRoute: () => null,
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { AuthCallback } from './AuthCallback'

describe('AuthCallback Component', () => {
  it('renders without crashing', () => {
    expect(() =>
      render(
        <MemoryRouter>
          <AuthCallback />
        </MemoryRouter>
      )
    ).not.toThrow()
  })

  it('renders the signing-in status text', () => {
    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>
    )
    expect(screen.getByText('authCallback.signingIn')).toBeTruthy()
  })

  it('renders a loading spinner', () => {
    const { container } = render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>
    )
    expect(container.querySelector('.spinner')).toBeTruthy()
  })
})
