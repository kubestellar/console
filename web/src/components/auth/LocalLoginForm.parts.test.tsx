import React from 'react'
/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

vi.mock('@/lib/utils/sanitizeUrl', () => ({
  sanitizeUrl: (url: string) => url,
}))

import { OAuthErrorBanner, OAuthSetupNotice } from './LocalLoginForm.parts'
import type { OAuthErrorEntry } from './useLocalLogin'

const errorInfo: OAuthErrorEntry = {
  title: 'GitHub OAuth Token Exchange Failed',
  message: 'The console was unable to complete the login with GitHub.',
  steps: ['Check your .env file', 'Restart the console'],
}

describe('OAuthErrorBanner', () => {
  it('renders without crashing', () => {
    expect(() =>
      render(<OAuthErrorBanner errorInfo={errorInfo} errorDetail={null} repoUrl="https://github.com/kubestellar/console" />),
    ).not.toThrow()
  })

  it('renders the localized error title and message', () => {
    render(<OAuthErrorBanner errorInfo={errorInfo} errorDetail={null} repoUrl="https://github.com/kubestellar/console" />)
    expect(screen.getByTestId('oauth-error-banner')).toBeInTheDocument()
    expect(screen.getByText(errorInfo.title)).toBeInTheDocument()
    expect(screen.getByText(errorInfo.message)).toBeInTheDocument()
  })

  it('renders each troubleshooting step', () => {
    render(<OAuthErrorBanner errorInfo={errorInfo} errorDetail={null} repoUrl="https://github.com/kubestellar/console" />)
    for (const step of errorInfo.steps) {
      expect(screen.getByText(step)).toBeInTheDocument()
    }
  })

  it('renders the error detail when provided', () => {
    render(<OAuthErrorBanner errorInfo={errorInfo} errorDetail="exchange_failed: bad_verification_code" repoUrl="https://github.com/kubestellar/console" />)
    expect(screen.getByText('exchange_failed: bad_verification_code')).toBeInTheDocument()
  })

  it('does not render an error-detail block when errorDetail is null', () => {
    render(<OAuthErrorBanner errorInfo={errorInfo} errorDetail={null} repoUrl="https://github.com/kubestellar/console" />)
    expect(screen.queryByText(/bad_verification_code/)).not.toBeInTheDocument()
  })

  it('links to the repo setup guide using the provided repoUrl', () => {
    render(<OAuthErrorBanner errorInfo={errorInfo} errorDetail={null} repoUrl="https://github.com/kubestellar/console" />)
    const setupGuideLink = screen.getByText('Setup Guide').closest('a')
    expect(setupGuideLink).toHaveAttribute('href', 'https://github.com/kubestellar/console#quick-start')
  })
})

describe('OAuthSetupNotice', () => {
  const noticeProps = {
    oauthSetupExpanded: false,
    onToggleExpand: vi.fn(),
    copiedStep: null,
    onCopyStep: vi.fn(),
    repoUrl: 'https://github.com/kubestellar/console',
  }

  it('renders without crashing', () => {
    expect(() => render(<OAuthSetupNotice {...noticeProps} />)).not.toThrow()
  })

  it('renders the setup notice container', () => {
    render(<OAuthSetupNotice {...noticeProps} />)
    expect(screen.getByTestId('oauth-setup-notice')).toBeInTheDocument()
  })

  it('does not render the setup steps when collapsed', () => {
    render(<OAuthSetupNotice {...noticeProps} oauthSetupExpanded={false} />)
    expect(screen.queryByText('GitHub Developer Settings')).not.toBeInTheDocument()
  })

  it('renders the setup steps when expanded', () => {
    render(<OAuthSetupNotice {...noticeProps} oauthSetupExpanded />)
    expect(screen.getByText('GitHub Developer Settings')).toBeInTheDocument()
    expect(screen.getByText('http://localhost:8080/auth/github/callback')).toBeInTheDocument()
  })

  it('calls onToggleExpand when the show/hide steps button is clicked', () => {
    const onToggleExpand = vi.fn()
    render(<OAuthSetupNotice {...noticeProps} onToggleExpand={onToggleExpand} />)
    fireEvent.click(screen.getByText('login.showSetupSteps'))
    expect(onToggleExpand).toHaveBeenCalledTimes(1)
  })

  it('calls onCopyStep with the command text when a copy button is clicked', () => {
    const onCopyStep = vi.fn()
    render(<OAuthSetupNotice {...noticeProps} oauthSetupExpanded onCopyStep={onCopyStep} />)
    const copyButtons = screen.getAllByTitle('Copy')
    fireEvent.click(copyButtons[0])
    expect(onCopyStep).toHaveBeenCalledWith(expect.stringContaining('GITHUB_CLIENT_ID='), 6)
  })

  it('shows a check icon for the currently copied step', () => {
    const { container } = render(<OAuthSetupNotice {...noticeProps} oauthSetupExpanded copiedStep={6} />)
    expect(container.querySelector('.text-green-400')).toBeTruthy()
  })
})
