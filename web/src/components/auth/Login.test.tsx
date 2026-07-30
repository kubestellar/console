import React from 'react'
/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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
let oauthProbeResult = { backendUp: false, oauthConfigured: false, inCluster: false }

vi.mock('../../lib/api', () => ({
  checkOAuthConfiguredWithRetry: () => Promise.resolve(oauthProbeResult),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
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
    oauthProbeResult = { backendUp: false, oauthConfigured: false, inCluster: false }
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

  it('does not render a terms of service footer', () => {
    renderLogin()
    expect(screen.queryByText('login.termsOfServicePrefix')).not.toBeInTheDocument()
    expect(screen.queryByText('login.termsOfServiceLink')).not.toBeInTheDocument()
  })

  describe('OAuth setup wizard (backendUp && !oauthConfigured)', () => {
    beforeEach(() => {
      oauthProbeResult = { backendUp: true, oauthConfigured: false, inCluster: false }
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

    it('does not render the cluster-access button when not in-cluster', async () => {
      renderLogin()
      await waitFor(() => {
        expect(screen.getByTestId('oauth-setup-notice')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('cluster-access-button')).not.toBeInTheDocument()
    })

    it('passes preferDemo to login() from the demo mode button', async () => {
      renderLogin()
      await waitFor(() => {
        expect(screen.getByTestId('demo-mode-button')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByTestId('demo-mode-button'))
      expect(mockLogin).toHaveBeenCalledWith({ preferDemo: true })
    })
  })

  describe('In-cluster dev-login (backendUp && !oauthConfigured && inCluster) — #20823', () => {
    beforeEach(() => {
      oauthProbeResult = { backendUp: true, oauthConfigured: false, inCluster: true }
    })

    it('renders the "Continue with cluster access" button', async () => {
      renderLogin()
      await waitFor(() => {
        expect(screen.getByTestId('cluster-access-button')).toBeInTheDocument()
      })
      expect(
        screen.getByRole('button', { name: 'login.continueWithClusterAccess' }),
      ).toBeInTheDocument()
      // Existing options remain available
      expect(screen.getByTestId('github-setup-button')).toBeInTheDocument()
      expect(screen.getByTestId('demo-mode-button')).toBeInTheDocument()
    })
  })
})
