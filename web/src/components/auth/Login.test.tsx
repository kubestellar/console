/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import '../../test/utils/setupMocks'

const mockLogin = vi.fn()

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    login: mockLogin,
    isAuthenticated: false,
    isLoading: false,
  }),
}))

/** Resolved value for the OAuth probe — overridden per-test when needed. */
let oauthProbeResult = { backendUp: false, oauthConfigured: false }

vi.mock('../../lib/api', () => ({
  checkOAuthConfiguredWithRetry: () => Promise.resolve(oauthProbeResult),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { Login } from './Login'

describe('Login Component', () => {
  const renderLogin = () =>
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    )

  beforeEach(() => {
    oauthProbeResult = { backendUp: false, oauthConfigured: false }
    mockLogin.mockClear()
  })

  it('renders without crashing', () => {
    expect(() => renderLogin()).not.toThrow()
  })

  it('renders the login page container', () => {
    renderLogin()
    expect(screen.getByTestId('login-page')).toBeInTheDocument()
  })

  it('renders the welcome heading', () => {
    renderLogin()
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('renders the GitHub login button', () => {
    renderLogin()
    expect(
      screen.getByRole('button', { name: 'login.continueWithGitHub' }),
    ).toBeInTheDocument()
  })

  it('renders the KubeStellar branding', () => {
    renderLogin()
    expect(screen.getByText('KubeStellar')).toBeInTheDocument()
  })

  describe('OAuth setup wizard (backendUp && !oauthConfigured)', () => {
    beforeEach(() => {
      oauthProbeResult = { backendUp: true, oauthConfigured: false }
    })

    it('shows the setup notice when backend is up but OAuth is not configured', async () => {
      renderLogin()
      await waitFor(() => {
        expect(screen.getByTestId('oauth-setup-notice')).toBeInTheDocument()
      })
    })

    it('renders a distinct setup button (not github-login-button)', async () => {
      renderLogin()
      await waitFor(() => {
        expect(screen.getByTestId('github-setup-button')).toBeInTheDocument()
      })
      // The standard login button should not be present when setup wizard is shown
      expect(screen.queryByTestId('github-login-button')).not.toBeInTheDocument()
    })

    it('renders a demo mode button', async () => {
      renderLogin()
      await waitFor(() => {
        expect(screen.getByTestId('demo-mode-button')).toBeInTheDocument()
      })
    })
  })
})
