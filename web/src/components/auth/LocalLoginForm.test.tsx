import React from 'react'
/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockLogin = vi.fn()

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

const { emitLogin } = vi.hoisted(() => ({ emitLogin: vi.fn() }))
vi.mock('../../lib/analytics', () => ({ emitLogin }))

let mockUseLocalLoginResult: Record<string, unknown> = {}
vi.mock('./useLocalLogin', () => ({
  useLocalLogin: () => mockUseLocalLoginResult,
  GITHUB_DEVELOPER_SETTINGS_URL: 'https://github.com/settings/developers',
  DEFAULT_OAUTH_CALLBACK: 'http://localhost:8080/auth/github/callback',
}))

import { LocalLoginForm } from './LocalLoginForm'

const branding = {
  appShortName: 'KS',
  appName: 'KubeStellar Console',
  repoUrl: 'https://github.com/kubestellar/console',
  hostedDomain: '',
}

function baseHookResult(overrides: Record<string, unknown> = {}) {
  return {
    sessionExpired: false,
    manifestSuccess: false,
    oauthError: null,
    errorDetail: null,
    errorInfo: null,
    branding,
    isHostedDemoLogin: false,
    showOAuthSetup: false,
    inClusterNoOAuth: false,
    oauthSetupExpanded: false,
    toggleOauthSetupExpanded: vi.fn(),
    copiedStep: null,
    handleCopyStep: vi.fn(),
    ...overrides,
  }
}

const defaultProps = {
  login: mockLogin,
  isLoading: false,
  isAuthenticated: false,
  starStyles: [
    { width: '2px', height: '2px', left: '10%', top: '20%', animationDelay: '0s' },
  ],
}

describe('LocalLoginForm', () => {
  beforeEach(() => {
    mockLogin.mockClear()
    emitLogin.mockClear()
    mockUseLocalLoginResult = baseHookResult()
  })

  it('renders without crashing', () => {
    expect(() => render(<LocalLoginForm {...defaultProps} />)).not.toThrow()
  })

  it('renders the branding name and app name', () => {
    render(<LocalLoginForm {...defaultProps} />)
    expect(screen.getByText('KS')).toBeInTheDocument()
    expect(screen.getByText('KubeStellar Console')).toBeInTheDocument()
  })

  it('renders the welcome heading by default', () => {
    render(<LocalLoginForm {...defaultProps} />)
    expect(screen.getByTestId('login-welcome-heading')).toHaveTextContent('login.welcomeBack')
  })

  it('renders a session-expired banner when sessionExpired is true', () => {
    mockUseLocalLoginResult = baseHookResult({ sessionExpired: true })
    render(<LocalLoginForm {...defaultProps} />)
    expect(screen.getByText('login.sessionTimedOut')).toBeInTheDocument()
    expect(screen.getByTestId('login-welcome-heading')).toHaveTextContent('login.sessionExpired')
  })

  it('renders a manifest-success banner when manifestSuccess is true', () => {
    mockUseLocalLoginResult = baseHookResult({ manifestSuccess: true })
    render(<LocalLoginForm {...defaultProps} />)
    expect(screen.getByText('login.manifestSuccessDetail')).toBeInTheDocument()
  })

  it('renders the OAuthErrorBanner and "Login Failed" heading when errorInfo is set', () => {
    mockUseLocalLoginResult = baseHookResult({
      oauthError: 'invalid_client',
      errorInfo: { title: 'Invalid OAuth Client Credentials', message: 'bad creds', steps: ['step 1'] },
    })
    render(<LocalLoginForm {...defaultProps} />)
    expect(screen.getByTestId('oauth-error-banner')).toBeInTheDocument()
    expect(screen.getByTestId('login-welcome-heading')).toHaveTextContent('Login Failed')
  })

  it('renders the hosted-demo notice when isHostedDemoLogin is true', () => {
    mockUseLocalLoginResult = baseHookResult({ isHostedDemoLogin: true })
    render(<LocalLoginForm {...defaultProps} />)
    expect(screen.getByText('Hosted demo')).toBeInTheDocument()
  })

  it('renders the GitHub OIDC login button when OAuth setup is not needed', () => {
    render(<LocalLoginForm {...defaultProps} />)
    expect(screen.getByTestId('github-login-button')).toBeInTheDocument()
    expect(screen.queryByTestId('oauth-setup-notice')).not.toBeInTheDocument()
  })

  it('calls login() and emits the github analytics event when the GitHub button is clicked', () => {
    render(<LocalLoginForm {...defaultProps} />)
    fireEvent.click(screen.getByTestId('github-login-button'))
    expect(mockLogin).toHaveBeenCalledWith()
    expect(emitLogin).toHaveBeenCalledWith('github')
  })

  it('renders the OAuthSetupNotice and SSOProviderList when showOAuthSetup is true', () => {
    mockUseLocalLoginResult = baseHookResult({ showOAuthSetup: true })
    render(<LocalLoginForm {...defaultProps} />)
    expect(screen.getByTestId('oauth-setup-notice')).toBeInTheDocument()
    expect(screen.getByTestId('github-setup-button')).toBeInTheDocument()
    expect(screen.getByTestId('demo-mode-button')).toBeInTheDocument()
    expect(screen.queryByTestId('github-login-button')).not.toBeInTheDocument()
  })

  it('renders the cluster-access button via SSOProviderList when inClusterNoOAuth is true', () => {
    mockUseLocalLoginResult = baseHookResult({ showOAuthSetup: true, inClusterNoOAuth: true })
    render(<LocalLoginForm {...defaultProps} />)
    expect(screen.getByTestId('cluster-access-button')).toBeInTheDocument()
  })

  it('emits demo-from-login and calls login({ preferDemo: true }) from the demo-mode button', () => {
    mockUseLocalLoginResult = baseHookResult({ showOAuthSetup: true })
    render(<LocalLoginForm {...defaultProps} />)
    fireEvent.click(screen.getByTestId('demo-mode-button'))
    expect(emitLogin).toHaveBeenCalledWith('demo-from-login')
    expect(mockLogin).toHaveBeenCalledWith({ preferDemo: true })
  })
})
