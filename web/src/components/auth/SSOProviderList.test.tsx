import React from 'react'
/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { SSOProviderList } from './SSOProviderList'

const baseProps = {
  inClusterNoOAuth: false,
  oauthSetupExpanded: false,
  continueWithClusterAccessLabel: 'Continue with cluster access',
  signInToGitHubFirstLabel: 'Sign in to GitHub first',
  setupGitHubSignInLabel: 'Set up GitHub Sign-In',
  hideManualSetupLabel: 'Hide manual setup',
  showManualSetupLabel: 'Show manual setup',
  continueInDemoModeLabel: 'Continue in demo mode',
  onClusterAccess: vi.fn(),
  onSetupGitHub: vi.fn(),
  onToggleManualSetup: vi.fn(),
  onDemoMode: vi.fn(),
}

describe('SSOProviderList', () => {
  it('renders without crashing', () => {
    expect(() => render(<SSOProviderList {...baseProps} />)).not.toThrow()
  })

  it('does not render the cluster-access button when inClusterNoOAuth is false', () => {
    render(<SSOProviderList {...baseProps} />)
    expect(screen.queryByTestId('cluster-access-button')).not.toBeInTheDocument()
  })

  it('renders the cluster-access button when inClusterNoOAuth is true', () => {
    render(<SSOProviderList {...baseProps} inClusterNoOAuth />)
    expect(screen.getByTestId('cluster-access-button')).toBeInTheDocument()
    expect(screen.getByText(baseProps.continueWithClusterAccessLabel)).toBeInTheDocument()
  })

  it('always renders the github-setup and demo-mode buttons', () => {
    render(<SSOProviderList {...baseProps} />)
    expect(screen.getByTestId('github-setup-button')).toBeInTheDocument()
    expect(screen.getByTestId('demo-mode-button')).toBeInTheDocument()
  })

  it('shows the "show manual setup" label when collapsed', () => {
    render(<SSOProviderList {...baseProps} oauthSetupExpanded={false} />)
    expect(screen.getByText(baseProps.showManualSetupLabel)).toBeInTheDocument()
    expect(screen.queryByText(baseProps.hideManualSetupLabel)).not.toBeInTheDocument()
  })

  it('shows the "hide manual setup" label when expanded', () => {
    render(<SSOProviderList {...baseProps} oauthSetupExpanded />)
    expect(screen.getByText(baseProps.hideManualSetupLabel)).toBeInTheDocument()
    expect(screen.queryByText(baseProps.showManualSetupLabel)).not.toBeInTheDocument()
  })

  it('invokes onClusterAccess when the cluster-access button is clicked', () => {
    const onClusterAccess = vi.fn()
    render(<SSOProviderList {...baseProps} inClusterNoOAuth onClusterAccess={onClusterAccess} />)
    fireEvent.click(screen.getByTestId('cluster-access-button'))
    expect(onClusterAccess).toHaveBeenCalledTimes(1)
  })

  it('invokes onSetupGitHub when the github-setup button is clicked', () => {
    const onSetupGitHub = vi.fn()
    render(<SSOProviderList {...baseProps} onSetupGitHub={onSetupGitHub} />)
    fireEvent.click(screen.getByTestId('github-setup-button'))
    expect(onSetupGitHub).toHaveBeenCalledTimes(1)
  })

  it('invokes onToggleManualSetup when the manual-setup toggle button is clicked', () => {
    const onToggleManualSetup = vi.fn()
    render(<SSOProviderList {...baseProps} onToggleManualSetup={onToggleManualSetup} />)
    fireEvent.click(screen.getByText(baseProps.showManualSetupLabel))
    expect(onToggleManualSetup).toHaveBeenCalledTimes(1)
  })

  it('invokes onDemoMode when the demo-mode button is clicked', () => {
    const onDemoMode = vi.fn()
    render(<SSOProviderList {...baseProps} onDemoMode={onDemoMode} />)
    fireEvent.click(screen.getByTestId('demo-mode-button'))
    expect(onDemoMode).toHaveBeenCalledTimes(1)
  })

  it('renders a link that points to github.com to sign in first', () => {
    render(<SSOProviderList {...baseProps} />)
    const link = screen.getByText(baseProps.signInToGitHubFirstLabel, { exact: false }).closest('a')
    expect(link).toHaveAttribute('href', 'https://github.com')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
